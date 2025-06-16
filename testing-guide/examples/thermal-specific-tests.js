// Example: Thermal-Specific Test Scenarios
// This file contains tests specifically designed for thermal monitoring applications

const { User, Project, Atome } = require('../tests/setup');

describe('Thermal Application Specific Tests', () => {

  // Helper function to create thermal-specific test data
  const createThermalProject = async (options = {}) => {
    const admin = await User.query().insert({
      name: options.adminName || 'Thermal Admin',
      password: 'thermal_pass',
      autorisation: 'admin'
    });

    const project = await Project.query().insert({
      name_project: options.projectName || 'Thermal Monitoring System',
      history_action: '[]',
      autorisation: options.access || 'restricted',
      user_id: admin.id
    });

    // Initialize with thermal-specific history
    project.addToHistory('system_initialization', admin.id, {
      system_type: 'thermal_monitoring',
      max_temperature: options.maxTemp || 1200,
      min_temperature: options.minTemp || 0,
      alert_threshold: options.alertThreshold || 1150,
      emergency_threshold: options.emergencyThreshold || 1200,
      sensor_count: options.sensorCount || 0
    });

    await Project.query().patchAndFetchById(project.id, {
      history_action: project.history_action
    });

    return { admin, project };
  };

  describe('Temperature Monitoring Tests', () => {
    test('should track temperature readings with timestamps', async () => {
      const { admin, project } = await createThermalProject();
      
      const engineer = await User.query().insert({
        name: 'Temperature Engineer',
        password: 'engineer_pass',
        autorisation: 'edit',
        project_id: project.id
      });

      const thermocouple = await Atome.query().insert({
        user_id: engineer.id,
        project_id: project.id,
        name_project: 'High-Temp Thermocouple TC-001'
      });

      // Simulate temperature readings over time
      const readings = [
        { temp: 25.3, time: '2024-12-06T08:00:00Z', status: 'startup' },
        { temp: 156.7, time: '2024-12-06T08:15:00Z', status: 'heating' },
        { temp: 487.2, time: '2024-12-06T08:30:00Z', status: 'normal' },
        { temp: 952.1, time: '2024-12-06T09:00:00Z', status: 'normal' },
        { temp: 1156.8, time: '2024-12-06T09:30:00Z', status: 'warning' },
        { temp: 1203.4, time: '2024-12-06T09:45:00Z', status: 'critical' }
      ];

      // Add each reading to project history
      for (const reading of readings) {
        project.addToHistory('temperature_reading', engineer.id, {
          sensor_id: thermocouple.id,
          sensor_name: thermocouple.name_project,
          temperature: reading.temp,
          timestamp: reading.time,
          status: reading.status,
          unit: 'celsius'
        });
      }

      await Project.query().patchAndFetchById(project.id, {
        history_action: project.history_action
      });

      // Verify temperature tracking
      const history = project.getHistory();
      const temperatureReadings = history.filter(entry => entry.action === 'temperature_reading');
      
      expect(temperatureReadings).toHaveLength(6);
      expect(temperatureReadings[0].changes.temperature).toBe(25.3);
      expect(temperatureReadings[5].changes.temperature).toBe(1203.4);
      expect(temperatureReadings[5].changes.status).toBe('critical');

      // Test temperature trend analysis
      const temperatures = temperatureReadings.map(r => r.changes.temperature);
      const maxTemp = Math.max(...temperatures);
      const minTemp = Math.min(...temperatures);
      const avgTemp = temperatures.reduce((a, b) => a + b, 0) / temperatures.length;

      expect(maxTemp).toBe(1203.4);
      expect(minTemp).toBe(25.3);
      expect(avgTemp).toBeCloseTo(663.68, 1);
    });

    test('should handle thermal alert escalation workflow', async () => {
      const { admin, project } = await createThermalProject({
        alertThreshold: 1000,
        emergencyThreshold: 1200
      });

      const operator = await User.query().insert({
        name: 'Control Room Operator',
        password: 'operator_pass',
        autorisation: 'edit',
        project_id: project.id
      });

      const sensor = await Atome.query().insert({
        user_id: operator.id,
        project_id: project.id,
        name_project: 'Furnace Core Temperature Sensor'
      });

      // Normal operation
      project.addToHistory('temperature_reading', operator.id, {
        sensor_id: sensor.id,
        temperature: 850.5,
        status: 'normal',
        timestamp: '2024-12-06T10:00:00Z'
      });

      // Warning threshold crossed
      project.addToHistory('alert_triggered', operator.id, {
        alert_type: 'temperature_warning',
        sensor_id: sensor.id,
        temperature: 1050.8,
        threshold: 1000,
        timestamp: '2024-12-06T10:15:00Z',
        auto_actions: ['cooling_system_activated', 'notification_sent']
      });

      // Critical threshold crossed
      project.addToHistory('emergency_alert', admin.id, {
        alert_type: 'temperature_critical',
        sensor_id: sensor.id,
        temperature: 1215.3,
        threshold: 1200,
        timestamp: '2024-12-06T10:20:00Z',
        emergency_actions: [
          'emergency_cooling_activated',
          'production_halted',
          'safety_team_notified',
          'executive_alert_sent'
        ]
      });

      // Emergency response
      project.addToHistory('emergency_response', admin.id, {
        response_time_seconds: 45,
        actions_taken: [
          'manual_shutdown_initiated',
          'fire_suppression_ready',
          'evacuation_standby'
        ],
        temperature_after_response: 1087.2,
        status: 'under_control'
      });

      await Project.query().patchAndFetchById(project.id, {
        history_action: project.history_action
      });

      // Verify alert escalation workflow
      const history = project.getHistory();
      const alertEvents = history.filter(entry => 
        entry.action.includes('alert') || entry.action.includes('emergency')
      );

      expect(alertEvents).toHaveLength(3);
      expect(alertEvents[0].action).toBe('alert_triggered');
      expect(alertEvents[1].action).toBe('emergency_alert');
      expect(alertEvents[2].action).toBe('emergency_response');

      // Verify response time tracking
      const emergencyResponse = history.find(entry => entry.action === 'emergency_response');
      expect(emergencyResponse.changes.response_time_seconds).toBe(45);
      expect(emergencyResponse.changes.status).toBe('under_control');
    });
  });

  describe('Thermal Sensor Management Tests', () => {
    test('should manage different types of thermal sensors', async () => {
      const { admin, project } = await createThermalProject();

      const sensorEngineer = await User.query().insert({
        name: 'Sensor Engineer',
        password: 'sensor_pass',
        autorisation: 'edit',
        project_id: project.id
      });

      // Create different types of thermal sensors
      const sensors = await Atome.query().insert([
        {
          user_id: sensorEngineer.id,
          project_id: project.id,
          name_project: 'K-Type Thermocouple - Zone A'
        },
        {
          user_id: sensorEngineer.id,
          project_id: project.id,
          name_project: 'Infrared Temperature Sensor - Zone B'
        },
        {
          user_id: sensorEngineer.id,
          project_id: project.id,
          name_project: 'RTD Pt100 - Cooling Circuit'
        },
        {
          user_id: admin.id,
          project_id: project.id,
          name_project: 'Emergency Thermal Switch - Safety'
        }
      ]);

      // Test sensor calibration workflow
      project.addToHistory('sensor_calibration', sensorEngineer.id, {
        sensor_id: sensors[0].id,
        sensor_type: 'k_type_thermocouple',
        calibration_standard: 'NIST_traceable',
        reference_temp: 1000.0,
        measured_temp: 999.8,
        error_celsius: -0.2,
        within_tolerance: true,
        next_calibration_due: '2025-06-06'
      });

      // Test sensor failure detection
      project.addToHistory('sensor_failure', sensorEngineer.id, {
        sensor_id: sensors[1].id,
        failure_type: 'signal_drift',
        last_known_temp: 456.7,
        error_detected_at: '2024-12-06T11:30:00Z',
        backup_sensor_activated: true,
        maintenance_required: true
      });

      // Test sensor replacement workflow
      project.addToHistory('sensor_replacement', admin.id, {
        old_sensor_id: sensors[1].id,
        new_sensor_id: sensors[2].id, // Temporary reassignment
        replacement_reason: 'failure_replacement',
        downtime_minutes: 15,
        system_impact: 'minimal',
        verification_complete: true
      });

      await Project.query().patchAndFetchById(project.id, {
        history_action: project.history_action
      });

      // Verify sensor management
      const projectSensors = await Atome.query().where('project_id', project.id);
      expect(projectSensors).toHaveLength(4);

      const history = project.getHistory();
      const sensorEvents = history.filter(entry => 
        entry.action.includes('sensor')
      );

      expect(sensorEvents).toHaveLength(3);
      expect(sensorEvents[0].action).toBe('sensor_calibration');
      expect(sensorEvents[1].action).toBe('sensor_failure');
      expect(sensorEvents[2].action).toBe('sensor_replacement');

      // Verify authorization for critical sensors
      const emergencySensor = sensors[3];
      expect(emergencySensor.canBeUsedBy(admin)).toBe(true);
      expect(emergencySensor.canBeUsedBy(sensorEngineer)).toBe(false);
    });
  });

  describe('Thermal Safety and Compliance Tests', () => {
    test('should maintain regulatory compliance audit trail', async () => {
      const { admin, project } = await createThermalProject({
        projectName: 'FDA Compliant Pharmaceutical Furnace'
      });

      const qualityEngineer = await User.query().insert({
        name: 'Quality Assurance Engineer',
        password: 'qa_pass',
        autorisation: 'edit',
        project_id: project.id
      });

      // Regulatory compliance events
      project.addToHistory('gmp_validation', admin.id, {
        validation_type: 'installation_qualification',
        standard: 'FDA_21_CFR_Part_11',
        validator: 'Certified_Validation_Engineer',
        validation_date: '2024-12-06',
        certificate_number: 'IQ-2024-TH-001',
        next_validation_due: '2025-12-06'
      });

      project.addToHistory('temperature_mapping', qualityEngineer.id, {
        mapping_type: 'thermal_distribution_study',
        duration_hours: 24,
        measurement_points: 15,
        temperature_uniformity: '+/- 2.5°C',
        hot_spots_identified: 2,
        cold_spots_identified: 1,
        meets_specification: true
      });

      project.addToHistory('deviation_investigation', admin.id, {
        deviation_id: 'DEV-2024-001',
        issue: 'temperature_excursion',
        max_temp_recorded: 1087.3,
        duration_minutes: 12,
        root_cause: 'cooling_system_malfunction',
        corrective_action: 'cooling_pump_replacement',
        preventive_action: 'implement_redundant_cooling',
        quality_impact: 'no_product_impact'
      });

      await Project.query().patchAndFetchById(project.id, {
        history_action: project.history_action
      });

      // Verify compliance audit trail
      const history = project.getHistory();
      const complianceEvents = history.filter(entry =>
        ['gmp_validation', 'temperature_mapping', 'deviation_investigation'].includes(entry.action)
      );

      expect(complianceEvents).toHaveLength(3);

      // Verify traceability
      const validation = complianceEvents.find(e => e.action === 'gmp_validation');
      expect(validation.changes.certificate_number).toBe('IQ-2024-TH-001');

      const deviation = complianceEvents.find(e => e.action === 'deviation_investigation');
      expect(deviation.changes.deviation_id).toBe('DEV-2024-001');
      expect(deviation.user_id).toBe(admin.id); // Admin handled critical deviation
    });

    test('should handle thermal safety interlocks', async () => {
      const { admin, project } = await createThermalProject();

      const safetyEngineer = await User.query().insert({
        name: 'Safety Systems Engineer',
        password: 'safety_pass',
        autorisation: 'admin',
        project_id: project.id
      });

      // Create safety interlock system
      const safetySystem = await Atome.query().insert({
        user_id: admin.id, // Only admin can control safety systems
        project_id: project.id,
        name_project: 'Thermal Safety Interlock System'
      });

      // Test safety interlock activation
      project.addToHistory('safety_interlock_test', safetyEngineer.id, {
        test_type: 'monthly_functional_test',
        interlock_systems: [
          'high_temperature_cutoff',
          'flame_failure_detection',
          'emergency_shutdown_valve',
          'cooling_system_monitor'
        ],
        test_results: {
          high_temp_cutoff: 'pass',
          flame_detection: 'pass', 
          emergency_valve: 'pass',
          cooling_monitor: 'pass'
        },
        test_duration_minutes: 45,
        system_downtime_minutes: 5
      });

      // Test actual emergency activation
      project.addToHistory('emergency_interlock_activation', admin.id, {
        trigger: 'temperature_runaway',
        triggered_temperature: 1267.8,
        activation_time_ms: 150,
        systems_activated: [
          'fuel_supply_cutoff',
          'emergency_cooling_flood',
          'fire_suppression_standby',
          'evacuation_alarm'
        ],
        peak_temperature: 1289.4,
        cool_down_time_minutes: 23,
        final_safe_temperature: 45.2,
        incident_severity: 'high',
        investigation_required: true
      });

      await Project.query().patchAndFetchById(project.id, {
        history_action: project.history_action
      });

      // Verify safety system functionality
      expect(safetySystem.canBeUsedBy(admin)).toBe(true);
      expect(safetySystem.canBeUsedBy(safetyEngineer)).toBe(true); // Safety engineer is admin
      
      const history = project.getHistory();
      const safetyEvents = history.filter(entry => 
        entry.action.includes('interlock') || entry.action.includes('safety')
      );

      expect(safetyEvents).toHaveLength(2);

      const emergencyEvent = safetyEvents.find(e => e.action === 'emergency_interlock_activation');
      expect(emergencyEvent.changes.activation_time_ms).toBe(150); // Fast response
      expect(emergencyEvent.changes.investigation_required).toBe(true);
    });
  });

  describe('Thermal Data Analysis Tests', () => {
    test('should support thermal trend analysis', async () => {
      const { admin, project } = await createThermalProject();

      const dataAnalyst = await User.query().insert({
        name: 'Thermal Data Analyst',
        password: 'analyst_pass',
        autorisation: 'read',
        project_id: project.id
      });

      // Generate thermal data for trend analysis
      const baseTemp = 500;
      const timeStart = new Date('2024-12-06T08:00:00Z');

      for (let hour = 0; hour < 24; hour++) {
        const timestamp = new Date(timeStart.getTime() + hour * 60 * 60 * 1000);
        const seasonalVariation = 50 * Math.sin((hour / 24) * 2 * Math.PI);
        const randomNoise = (Math.random() - 0.5) * 10;
        const temperature = baseTemp + seasonalVariation + randomNoise;

        project.addToHistory('hourly_temperature_log', dataAnalyst.id, {
          hour: hour,
          timestamp: timestamp.toISOString(),
          temperature: Math.round(temperature * 10) / 10,
          pressure: 1.0 + (hour * 0.02),
          humidity: 45 + (hour * 0.5),
          energy_consumption_kwh: 15.5 + (temperature - baseTemp) * 0.1
        });
      }

      await Project.query().patchAndFetchById(project.id, {
        history_action: project.history_action
      });

      // Analyze thermal trends
      const history = project.getHistory();
      const temperatureLogs = history.filter(entry => entry.action === 'hourly_temperature_log');
      
      expect(temperatureLogs).toHaveLength(24);

      // Calculate statistics
      const temperatures = temperatureLogs.map(log => log.changes.temperature);
      const maxTemp = Math.max(...temperatures);
      const minTemp = Math.min(...temperatures);
      const avgTemp = temperatures.reduce((a, b) => a + b, 0) / temperatures.length;

      expect(maxTemp).toBeGreaterThan(baseTemp);
      expect(minTemp).toBeLessThan(baseTemp);
      expect(avgTemp).toBeCloseTo(baseTemp, 0); // Should be close to base temp

      // Verify data analyst can read but not modify
      expect(dataAnalyst.hasPermission('read')).toBe(true);
      expect(dataAnalyst.hasPermission('edit')).toBe(false);
    });
  });
});

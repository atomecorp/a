// Example: Basic Model Testing Template
// Copy this file to create new tests for your thermal app

const { User, Project, Atome } = require('../tests/setup');

describe('Example Model Tests', () => {
  
  // Basic CRUD operations
  describe('CREATE Operations', () => {
    test('should create new record with valid data', async () => {
      const userData = {
        name: 'Test User',
        password: 'secure_password',
        autorisation: 'read'
      };

      const user = await User.query().insert(userData);
      
      expect(user.id).toBeDefined();
      expect(user.name).toBe('Test User');
      expect(user.autorisation).toBe('read');
    });

    test('should reject invalid data', async () => {
      const invalidData = {
        // Missing required fields
        autorisation: 'invalid_level'
      };

      await expect(User.query().insert(invalidData))
        .rejects
        .toThrow();
    });
  });

  describe('READ Operations', () => {
    test('should find existing record', async () => {
      // Create test data first
      const user = await User.query().insert({
        name: 'Findable User',
        password: 'password',
        autorisation: 'edit'
      });

      // Test finding the record
      const found = await User.query().findById(user.id);
      
      expect(found).toBeDefined();
      expect(found.name).toBe('Findable User');
    });

    test('should return undefined for non-existent record', async () => {
      const notFound = await User.query().findById(99999);
      expect(notFound).toBeUndefined();
    });
  });

  describe('UPDATE Operations', () => {
    test('should update existing record', async () => {
      // Create test data
      const user = await User.query().insert({
        name: 'Original Name',
        password: 'password',
        autorisation: 'read'
      });

      // Update the record
      const updated = await User.query()
        .patchAndFetchById(user.id, {
          name: 'Updated Name',
          autorisation: 'edit'
        });

      expect(updated.name).toBe('Updated Name');
      expect(updated.autorisation).toBe('edit');
    });
  });

  describe('DELETE Operations', () => {
    test('should delete existing record', async () => {
      // Create test data
      const user = await User.query().insert({
        name: 'To Be Deleted',
        password: 'password',
        autorisation: 'read'
      });

      // Delete the record
      const deleteCount = await User.query().deleteById(user.id);
      expect(deleteCount).toBe(1);

      // Verify it's deleted
      const deleted = await User.query().findById(user.id);
      expect(deleted).toBeUndefined();
    });
  });
});

// Testing relationships between models
describe('Relationship Tests', () => {
  test('should handle one-to-many relationships', async () => {
    // Create parent record
    const project = await Project.query().insert({
      name_project: 'Parent Project',
      history_action: '[]',
      autorisation: 'public'
    });

    // Create child records
    const user1 = await User.query().insert({
      name: 'Child User 1',
      password: 'pass1',
      autorisation: 'read',
      project_id: project.id
    });

    const user2 = await User.query().insert({
      name: 'Child User 2', 
      password: 'pass2',
      autorisation: 'edit',
      project_id: project.id
    });

    // Test relationship
    const projectWithUsers = await Project.query()
      .findById(project.id)
      .withGraphFetched('users');

    expect(projectWithUsers.users).toHaveLength(2);
    expect(projectWithUsers.users[0].name).toBe('Child User 1');
    expect(projectWithUsers.users[1].name).toBe('Child User 2');
  });

  test('should handle many-to-many style relationships', async () => {
    // Create project
    const project = await Project.query().insert({
      name_project: 'Multi-User Project',
      autorisation: 'public'
    });

    // Create user
    const user = await User.query().insert({
      name: 'Multi-Project User',
      password: 'password',
      autorisation: 'edit'
    });

    // Create atomes linking user and project
    const atome1 = await Atome.query().insert({
      user_id: user.id,
      project_id: project.id,
      name_project: 'Temperature Sensor'
    });

    const atome2 = await Atome.query().insert({
      user_id: user.id,
      project_id: project.id,
      name_project: 'Pressure Monitor'
    });

    // Test relationships
    const userWithAtomes = await User.query()
      .findById(user.id)
      .withGraphFetched('atomes');

    const projectWithAtomes = await Project.query()
      .findById(project.id)
      .withGraphFetched('atomes');

    expect(userWithAtomes.atomes).toHaveLength(2);
    expect(projectWithAtomes.atomes).toHaveLength(2);
  });
});

// Testing business logic and custom methods
describe('Business Logic Tests', () => {
  test('should validate authorization permissions', async () => {
    const readUser = await User.query().insert({
      name: 'Read Only',
      password: 'password',
      autorisation: 'read'
    });

    const editUser = await User.query().insert({
      name: 'Editor',
      password: 'password',
      autorisation: 'edit'
    });

    const adminUser = await User.query().insert({
      name: 'Administrator',
      password: 'password',
      autorisation: 'admin'
    });

    // Test permission levels
    expect(readUser.hasPermission('read')).toBe(true);
    expect(readUser.hasPermission('edit')).toBe(false);
    expect(readUser.hasPermission('admin')).toBe(false);

    expect(editUser.hasPermission('read')).toBe(true);
    expect(editUser.hasPermission('edit')).toBe(true);
    expect(editUser.hasPermission('admin')).toBe(false);

    expect(adminUser.hasPermission('read')).toBe(true);
    expect(adminUser.hasPermission('edit')).toBe(true);
    expect(adminUser.hasPermission('admin')).toBe(true);
  });

  test('should handle project history tracking', async () => {
    const project = await Project.query().insert({
      name_project: 'History Test Project',
      history_action: '[]',
      autorisation: 'private'
    });

    const user = await User.query().insert({
      name: 'History User',
      password: 'password',
      autorisation: 'edit'
    });

    // Add history entries
    project.addToHistory('project_created', user.id, {
      initial_setup: true,
      temperature_range: '20-100°C'
    });

    project.addToHistory('temperature_updated', user.id, {
      old_temp: 25.5,
      new_temp: 28.3,
      sensor_id: 'TH001'
    });

    // Test history functionality
    const history = project.getHistory();
    expect(history).toHaveLength(2);
    expect(history[0].action).toBe('project_created');
    expect(history[1].action).toBe('temperature_updated');
    expect(history[1].changes.new_temp).toBe(28.3);

    // Test version retrieval
    const version1 = project.getVersion(1);
    expect(version1.action).toBe('project_created');
    expect(version1.changes.initial_setup).toBe(true);
  });
});

// Testing error conditions and edge cases
describe('Error Handling Tests', () => {
  test('should handle missing required fields', async () => {
    await expect(User.query().insert({}))
      .rejects
      .toThrow();
  });

  test('should handle invalid foreign key references', async () => {
    await expect(User.query().insert({
      name: 'Invalid User',
      password: 'password',
      autorisation: 'read',
      project_id: 99999 // Non-existent project
    })).rejects.toThrow();
  });

  test('should handle invalid enum values', async () => {
    await expect(User.query().insert({
      name: 'Invalid Auth User',
      password: 'password',
      autorisation: 'invalid_level' // Invalid authorization level
    })).rejects.toThrow();
  });
});

// Performance tests (optional)
describe('Performance Tests', () => {
  test('should handle bulk operations efficiently', async () => {
    const startTime = Date.now();
    
    // Create multiple records
    const users = [];
    for (let i = 0; i < 100; i++) {
      users.push({
        name: `Bulk User ${i}`,
        password: `password${i}`,
        autorisation: 'read'
      });
    }

    await User.query().insert(users);
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    // Should complete within reasonable time (adjust threshold as needed)
    expect(duration).toBeLessThan(5000); // 5 seconds
    
    // Verify all records were created
    const count = await User.query().count();
    expect(count[0]['count(*)']).toBeGreaterThanOrEqual(100);
  });
});

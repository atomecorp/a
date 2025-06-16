# 🧪 Jest Testing Examples

This folder contains practical examples of testing patterns for your thermal application database.

## 📁 Files in this folder:

### 1. `basic-model-tests.js`
**Purpose**: Template for basic CRUD operations and model validation
**Use case**: Copy this file as a starting point for testing new models
**Key features**:
- CREATE, READ, UPDATE, DELETE operations
- Relationship testing
- Business logic validation
- Error handling
- Performance testing basics

### 2. `advanced-testing-patterns.js`
**Purpose**: Advanced testing techniques and patterns
**Use case**: Learn sophisticated testing approaches
**Key features**:
- Fixture-based testing with reusable data
- Complex workflow testing
- Mocking and spying
- Error scenario testing
- Performance and stress testing
- Deep relationship queries

### 3. `thermal-specific-tests.js`
**Purpose**: Domain-specific tests for thermal monitoring applications
**Use case**: Examples specific to thermal/temperature monitoring systems
**Key features**:
- Temperature reading tracking
- Thermal alert escalation workflows
- Sensor management and calibration
- Safety and compliance testing
- Regulatory audit trails
- Data analysis and trending

## 🚀 How to use these examples:

### Run individual example files:
```bash
# Run basic model tests
npm test testing-guide/examples/basic-model-tests.js

# Run advanced pattern tests
npm test testing-guide/examples/advanced-testing-patterns.js

# Run thermal-specific tests
npm test testing-guide/examples/thermal-specific-tests.js
```

### Copy and modify for your needs:
1. Copy any example file to your `tests/` folder
2. Rename it appropriately (e.g., `user-authentication.test.js`)
3. Modify the test cases for your specific requirements
4. Add or remove test scenarios as needed

### Example workflow:
```bash
# 1. Copy the basic template
cp testing-guide/examples/basic-model-tests.js tests/my-new-feature.test.js

# 2. Edit the file to test your feature
# ... edit tests/my-new-feature.test.js ...

# 3. Run your new tests
npm test my-new-feature.test.js
```

## 📋 Test Categories Covered:

### Basic Testing (basic-model-tests.js):
- ✅ Model creation and validation
- ✅ CRUD operations
- ✅ Relationship testing
- ✅ Permission validation
- ✅ Error handling
- ✅ Basic performance

### Advanced Testing (advanced-testing-patterns.js):
- ✅ Fixture-based data management
- ✅ Complex business workflows
- ✅ Mocking external dependencies
- ✅ Spy tracking and verification
- ✅ Stress testing with large datasets
- ✅ Deep relationship queries
- ✅ Transaction testing

### Thermal Domain Testing (thermal-specific-tests.js):
- ✅ Temperature monitoring workflows
- ✅ Alert and emergency systems
- ✅ Sensor management and calibration
- ✅ Safety interlock testing
- ✅ Compliance and audit trails
- ✅ Data analysis and trending
- ✅ Regulatory validation

## 🎯 Best Practices Demonstrated:

1. **Test Organization**
   - Descriptive test names
   - Logical grouping with `describe()` blocks
   - Clear separation of setup, action, and assertion

2. **Data Management**
   - Fresh test data for each test
   - Reusable fixtures and factories
   - Proper cleanup between tests

3. **Assertion Patterns**
   - Specific and meaningful assertions
   - Testing both success and failure cases
   - Performance threshold validation

4. **Error Testing**
   - Invalid input validation
   - Constraint violation testing
   - Permission and authorization checks

5. **Real-World Scenarios**
   - Complete business workflows
   - Integration between multiple models
   - Time-based and sequential operations

## 🔧 Customization Tips:

### Modify test data:
- Update the `createTestUser()`, `createTestProject()` functions
- Add your own fixture functions for consistent test data
- Adjust permissions and authorization levels for your use case

### Add new test categories:
```javascript
describe('Your New Feature Tests', () => {
  test('should handle your specific use case', async () => {
    // Your test logic here
  });
});
```

### Performance tuning:
- Adjust timeout values for your environment
- Modify performance thresholds based on your requirements
- Add memory usage monitoring if needed

### Domain-specific adaptations:
- Replace thermal-specific terminology with your domain
- Adjust data ranges and validation rules
- Modify workflow steps for your business processes

## 📊 Running with Coverage:

To see how well these examples cover your code:

```bash
# Run examples with coverage
npm run test:coverage -- testing-guide/examples/

# Open coverage report
# coverage/lcov-report/index.html
```

This will show you which parts of your models and business logic are being tested by these examples.

## 🤝 Contributing:

If you create useful test patterns, consider adding them to this examples folder:

1. Follow the existing naming convention
2. Add comprehensive comments explaining the patterns
3. Include both simple and complex scenarios
4. Document any special setup requirements

---

Happy Testing! 🚀

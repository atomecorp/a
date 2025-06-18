# 📊 Table API - Data Table Component

## 🚀 Basic Usage

### Simple Table
```javascript
const basicTable = new Table({
    attach: 'body',
    id: 'my_table',
    x: 50, y: 50,
    width: 800,
    height: 400,
    
    columns: [
        { key: 'id', title: 'ID', width: '80px' },
        { key: 'name', title: 'Name', width: '200px' },
        { key: 'email', title: 'Email', width: '250px' },
        { key: 'status', title: 'Status', width: '120px' }
    ],
    
    data: [
        { id: 1, name: 'John Doe', email: 'john@example.com', status: 'Active' },
        { id: 2, name: 'Jane Smith', email: 'jane@example.com', status: 'Inactive' },
        { id: 3, name: 'Bob Johnson', email: 'bob@example.com', status: 'Active' }
    ],
    
    callbacks: {
        onRowClick: (row, index, event) => {
            console.log(`Clicked row:`, row);
        }
    }
});
```

## ⚙️ Configuration Options

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| `columns` | array | Column definitions | `[]` |
| `data` | array | Table data | `[]` |
| `sortable` | boolean | Enable column sorting | `true` |
| `filterable` | boolean | Enable column filtering | `false` |
| `searchable` | boolean | Enable global search | `false` |
| `editable` | boolean | Enable inline editing | `false` |
| `selectable` | boolean | Enable row selection | `false` |
| `multiSelect` | boolean | Allow multiple row selection | `false` |
| `resizable` | boolean | Enable column resizing | `false` |
| `stripedRows` | boolean | Alternate row colors | `true` |

## 📊 Column Configuration

### Column Properties
```javascript
const advancedTable = new Table({
    attach: 'body',
    columns: [
        {
            key: 'id',
            title: 'ID',
            width: '80px',
            align: 'center',
            sortable: true,
            filterable: false,
            editable: false
        },
        {
            key: 'name',
            title: 'Full Name',
            width: '200px',
            align: 'left',
            sortable: true,
            filterable: true,
            editable: true
        },
        {
            key: 'salary',
            title: 'Salary',
            width: '150px',
            align: 'right',
            sortable: true,
            type: 'number',
            render: (value) => `$${value.toLocaleString()}`
        },
        {
            key: 'actions',
            title: 'Actions',
            width: '120px',
            align: 'center',
            sortable: false,
            render: (value, row) => {
                return `
                    <button onclick="editUser(${row.id})">Edit</button>
                    <button onclick="deleteUser(${row.id})">Delete</button>
                `;
            }
        }
    ],
    
    data: [
        { id: 1, name: 'John Doe', salary: 75000 },
        { id: 2, name: 'Jane Smith', salary: 85000 },
        { id: 3, name: 'Bob Johnson', salary: 65000 }
    ]
});
```

## 🎨 Styling Options

### Custom Styling
```javascript
const styledTable = new Table({
    attach: 'body',
    width: 900,
    height: 500,
    
    style: {
        backgroundColor: '#ffffff',
        border: '2px solid #e0e0e0',
        borderRadius: '12px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
        fontFamily: 'Inter, sans-serif'
    },
    
    headerStyle: {
        backgroundColor: '#1976d2',
        color: 'white',
        fontWeight: 'bold',
        fontSize: '14px'
    },
    
    cellStyle: {
        padding: '16px 20px',
        fontSize: '14px',
        borderBottom: '1px solid #f0f0f0'
    },
    
    rowHoverStyle: {
        backgroundColor: '#f8f9fa',
        transform: 'scale(1.001)'
    },
    
    rowSelectedStyle: {
        backgroundColor: '#e3f2fd',
        borderLeft: '4px solid #1976d2'
    },
    
    stripedRows: true,
    stripedStyle: {
        backgroundColor: '#fafafa'
    }
});
```

## 🔍 Search and Filter

### Searchable Table
```javascript
const searchableTable = new Table({
    attach: 'body',
    width: 800,
    searchable: true,
    filterable: true,
    
    columns: [
        { key: 'product', title: 'Product', filterable: true },
        { key: 'category', title: 'Category', filterable: true },
        { key: 'price', title: 'Price', type: 'number', align: 'right' },
        { key: 'stock', title: 'Stock', type: 'number', align: 'center' }
    ],
    
    data: [
        { id: 1, product: 'iPhone 13', category: 'Electronics', price: 999, stock: 50 },
        { id: 2, product: 'Nike Shoes', category: 'Fashion', price: 129, stock: 25 },
        { id: 3, product: 'Coffee Maker', category: 'Home', price: 89, stock: 15 }
    ],
    
    callbacks: {
        onFilter: (filteredData) => {
            console.log(`Filtered to ${filteredData.length} items`);
        }
    }
});
```

## 📄 Pagination

### Paginated Table
```javascript
const paginatedTable = new Table({
    attach: 'body',
    width: 800,
    height: 500,
    
    pagination: {
        enabled: true,
        pageSize: 5,
        showInfo: true,
        showControls: true
    },
    
    columns: [
        { key: 'id', title: 'ID', width: '60px' },
        { key: 'name', title: 'Name', width: '200px' },
        { key: 'department', title: 'Department', width: '150px' },
        { key: 'salary', title: 'Salary', width: '120px', align: 'right' }
    ],
    
    data: Array.from({ length: 50 }, (_, i) => ({
        id: i + 1,
        name: `Employee ${i + 1}`,
        department: ['Engineering', 'Sales', 'Marketing', 'HR'][i % 4],
        salary: Math.floor(Math.random() * 50000) + 50000
    })),
    
    callbacks: {
        onPageChange: (page) => {
            console.log(`Changed to page ${page}`);
        }
    }
});
```

## ✏️ Editable Table

### Inline Editing
```javascript
const editableTable = new Table({
    attach: 'body',
    width: 700,
    editable: true,
    
    columns: [
        { key: 'id', title: 'ID', editable: false, width: '60px' },
        { key: 'name', title: 'Name', editable: true, width: '200px' },
        { key: 'email', title: 'Email', editable: true, width: '250px' },
        { key: 'age', title: 'Age', editable: true, type: 'number', width: '80px' }
    ],
    
    data: [
        { id: 1, name: 'John Doe', email: 'john@example.com', age: 30 },
        { id: 2, name: 'Jane Smith', email: 'jane@example.com', age: 25 },
        { id: 3, name: 'Bob Johnson', email: 'bob@example.com', age: 35 }
    ],
    
    callbacks: {
        onCellEdit: (row, column, newValue, oldValue) => {
            console.log(`Changed ${column}: ${oldValue} → ${newValue}`);
            
            // Here you could make an API call to save the change
            // saveToServer(row.id, column, newValue);
        }
    }
});
```

## 🎯 Selection

### Selectable Table
```javascript
const selectableTable = new Table({
    attach: 'body',
    width: 800,
    selectable: true,
    multiSelect: true,
    
    columns: [
        { key: 'id', title: 'ID', width: '60px' },
        { key: 'task', title: 'Task', width: '300px' },
        { key: 'priority', title: 'Priority', width: '100px' },
        { key: 'status', title: 'Status', width: '120px' }
    ],
    
    data: [
        { id: 1, task: 'Fix login bug', priority: 'High', status: 'In Progress' },
        { id: 2, task: 'Update documentation', priority: 'Medium', status: 'Todo' },
        { id: 3, task: 'Code review', priority: 'High', status: 'Done' }
    ],
    
    callbacks: {
        onSelectionChange: (selectedRowIds) => {
            console.log(`Selected ${selectedRowIds.length} rows`);
            
            // Enable/disable bulk action buttons
            const bulkActions = document.getElementById('bulk-actions');
            if (bulkActions) {
                bulkActions.style.display = selectedRowIds.length > 0 ? 'block' : 'none';
            }
        }
    }
});

// Bulk actions
function deleteSelected() {
    const selected = selectableTable.getSelectedRows();
    selected.forEach(row => {
        selectableTable.removeRow(row.id);
    });
}
```

## 📈 Advanced Features

### Custom Renderers
```javascript
const advancedTable = new Table({
    attach: 'body',
    width: 900,
    
    columns: [
        {
            key: 'avatar',
            title: 'User',
            width: '200px',
            render: (value, row) => {
                return `
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <img src="${row.avatar}" style="width: 32px; height: 32px; border-radius: 50%;" />
                        <div>
                            <div style="font-weight: bold;">${row.name}</div>
                            <div style="font-size: 12px; color: #666;">${row.role}</div>
                        </div>
                    </div>
                `;
            }
        },
        {
            key: 'status',
            title: 'Status',
            width: '120px',
            render: (value) => {
                const colors = {
                    'Active': '#4caf50',
                    'Inactive': '#f44336',
                    'Pending': '#ff9800'
                };
                
                return `
                    <span style="
                        background: ${colors[value] || '#999'}; 
                        color: white; 
                        padding: 4px 8px; 
                        border-radius: 12px; 
                        font-size: 11px;
                        font-weight: bold;
                    ">${value}</span>
                `;
            }
        },
        {
            key: 'progress',
            title: 'Progress',
            width: '150px',
            render: (value) => {
                return `
                    <div style="width: 100%; background: #eee; border-radius: 10px; height: 8px;">
                        <div style="
                            width: ${value}%; 
                            background: #4caf50; 
                            height: 100%; 
                            border-radius: 10px;
                            transition: width 0.3s ease;
                        "></div>
                    </div>
                    <div style="text-align: center; font-size: 11px; margin-top: 2px;">${value}%</div>
                `;
            }
        }
    ],
    
    data: [
        {
            id: 1,
            name: 'John Doe',
            role: 'Developer',
            avatar: 'john.jpg',
            status: 'Active',
            progress: 85
        },
        {
            id: 2,
            name: 'Jane Smith',
            role: 'Designer',
            avatar: 'jane.jpg',
            status: 'Pending',
            progress: 65
        }
    ]
});
```

## 🔄 Dynamic Operations

### Adding and Updating Data
```javascript
const dynamicTable = new Table({
    attach: 'body',
    width: 800,
    columns: [
        { key: 'id', title: 'ID' },
        { key: 'name', title: 'Name' },
        { key: 'email', title: 'Email' }
    ],
    data: []
});

// Add new row
dynamicTable.addRow({
    id: Date.now(),
    name: 'New User',
    email: 'new@example.com'
});

// Update existing row
dynamicTable.updateRow(1, {
    name: 'Updated Name',
    email: 'updated@example.com'
});

// Remove row
dynamicTable.removeRow(1);

// Get selected rows
const selected = dynamicTable.getSelectedRows();
console.log('Selected rows:', selected);

// Clear selection
dynamicTable.clearSelection();

// Refresh table
dynamicTable.refresh();
```

## 💾 Export Functionality

The Table component includes built-in CSV export functionality:

```javascript
const exportTable = new Table({
    attach: 'body',
    width: 800,
    // Export button is automatically added to toolbar
    searchable: true, // This enables the toolbar
    
    columns: [
        { key: 'product', title: 'Product Name' },
        { key: 'category', title: 'Category' },
        { key: 'price', title: 'Price' },
        { key: 'stock', title: 'Stock Quantity' }
    ],
    
    data: [
        { product: 'Laptop', category: 'Electronics', price: 999, stock: 15 },
        { product: 'Mouse', category: 'Electronics', price: 25, stock: 50 },
        { product: 'Desk', category: 'Furniture', price: 299, stock: 8 }
    ]
});

// The export button automatically exports filtered/sorted data as CSV
```

## 🎨 Complete Examples

### Employee Management Table
```javascript
class EmployeeTable {
    constructor() {
        this.table = new Table({
            attach: 'body',
            id: 'employee_table',
            width: 1000,
            height: 600,
            
            searchable: true,
            filterable: true,
            selectable: true,
            multiSelect: true,
            editable: true,
            
            pagination: {
                enabled: true,
                pageSize: 10
            },
            
            columns: [
                { 
                    key: 'id', 
                    title: 'ID', 
                    width: '60px', 
                    editable: false 
                },
                { 
                    key: 'name', 
                    title: 'Full Name', 
                    width: '200px' 
                },
                { 
                    key: 'department', 
                    title: 'Department', 
                    width: '150px' 
                },
                { 
                    key: 'salary', 
                    title: 'Salary', 
                    width: '120px',
                    align: 'right',
                    render: (value) => `$${value.toLocaleString()}`
                },
                { 
                    key: 'startDate', 
                    title: 'Start Date', 
                    width: '120px' 
                },
                {
                    key: 'actions',
                    title: 'Actions',
                    width: '150px',
                    align: 'center',
                    sortable: false,
                    editable: false,
                    render: (value, row) => `
                        <button onclick="editEmployee(${row.id})" style="margin: 0 2px; padding: 4px 8px; font-size: 11px;">Edit</button>
                        <button onclick="deleteEmployee(${row.id})" style="margin: 0 2px; padding: 4px 8px; font-size: 11px; background: #f44336; color: white; border: none;">Delete</button>
                    `
                }
            ],
            
            data: this.generateEmployeeData(),
            
            callbacks: {
                onCellEdit: (row, column, newValue, oldValue) => {
                    this.updateEmployee(row.id, column, newValue);
                },
                onSelectionChange: (selectedIds) => {
                    this.updateBulkActions(selectedIds.length);
                }
            }
        });
        
        this.createBulkActions();
    }
    
    generateEmployeeData() {
        const departments = ['Engineering', 'Sales', 'Marketing', 'HR', 'Finance'];
        const employees = [];
        
        for (let i = 1; i <= 50; i++) {
            employees.push({
                id: i,
                name: `Employee ${i}`,
                department: departments[Math.floor(Math.random() * departments.length)],
                salary: Math.floor(Math.random() * 50000) + 50000,
                startDate: new Date(2020 + Math.floor(Math.random() * 4), 
                                  Math.floor(Math.random() * 12), 
                                  Math.floor(Math.random() * 28) + 1)
                           .toISOString().split('T')[0]
            });
        }
        
        return employees;
    }
    
    createBulkActions() {
        const bulkContainer = new A({
            attach: 'body',
            id: 'bulk-actions',
            x: 50,
            y: 20,
            padding: '12px',
            backgroundColor: '#fff3cd',
            border: '1px solid #ffeaa7',
            borderRadius: '4px',
            display: 'none'
        });
        
        new A({
            attach: bulkContainer,
            text: 'Bulk Actions: ',
            marginRight: '12px'
        });
        
        const deleteButton = new A({
            attach: bulkContainer,
            text: 'Delete Selected',
            padding: '6px 12px',
            backgroundColor: '#f44336',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            marginRight: '8px'
        });
        
        deleteButton.getElement().addEventListener('click', () => {
            this.deleteSelectedEmployees();
        });
    }
    
    updateEmployee(id, field, value) {
        console.log(`Updating employee ${id}: ${field} = ${value}`);
        // Here you would typically make an API call
    }
    
    updateBulkActions(count) {
        const bulkActions = document.getElementById('bulk-actions');
        if (bulkActions) {
            bulkActions.style.display = count > 0 ? 'block' : 'none';
        }
    }
    
    deleteSelectedEmployees() {
        const selected = this.table.getSelectedRows();
        selected.forEach(employee => {
            this.table.removeRow(employee.id);
        });
        
        console.log(`Deleted ${selected.length} employees`);
    }
}

// Create employee management system
const employeeManager = new EmployeeTable();

// Global functions for action buttons
function editEmployee(id) {
    console.log(`Edit employee ${id}`);
}

function deleteEmployee(id) {
    console.log(`Delete employee ${id}`);
}
```

### Sales Dashboard Table
```javascript
const salesTable = new Table({
    attach: 'body',
    id: 'sales_dashboard',
    width: 1200,
    height: 500,
    
    style: {
        backgroundColor: '#1a1a1a',
        color: 'white',
        border: '1px solid #333'
    },
    
    headerStyle: {
        backgroundColor: '#333',
        color: 'white',
        borderBottom: '2px solid #555'
    },
    
    cellStyle: {
        borderBottom: '1px solid #333',
        borderRight: '1px solid #333'
    },
    
    stripedStyle: {
        backgroundColor: '#222'
    },
    
    searchable: true,
    sortable: true,
    
    columns: [
        { 
            key: 'region', 
            title: 'Region', 
            width: '150px' 
        },
        { 
            key: 'sales', 
            title: 'Sales', 
            width: '150px',
            align: 'right',
            render: (value) => `$${(value / 1000).toFixed(1)}K`
        },
        { 
            key: 'target', 
            title: 'Target', 
            width: '150px',
            align: 'right',
            render: (value) => `$${(value / 1000).toFixed(1)}K`
        },
        { 
            key: 'performance', 
            title: 'Performance', 
            width: '200px',
            render: (value, row) => {
                const percentage = ((row.sales / row.target) * 100).toFixed(1);
                const color = percentage >= 100 ? '#4caf50' : percentage >= 80 ? '#ff9800' : '#f44336';
                
                return `
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <div style="
                            width: 100px; 
                            height: 8px; 
                            background: #333; 
                            border-radius: 4px; 
                            overflow: hidden;
                        ">
                            <div style="
                                width: ${Math.min(percentage, 100)}%; 
                                height: 100%; 
                                background: ${color};
                                transition: width 0.3s ease;
                            "></div>
                        </div>
                        <span style="color: ${color}; font-weight: bold;">${percentage}%</span>
                    </div>
                `;
            }
        },
        { 
            key: 'trend', 
            title: 'Trend', 
            width: '100px',
            align: 'center',
            render: (value) => {
                const trends = {
                    'up': '📈 +12%',
                    'down': '📉 -5%',
                    'stable': '➡️ +2%'
                };
                return trends[value] || value;
            }
        }
    ],
    
    data: [
        { region: 'North America', sales: 125000, target: 120000, trend: 'up' },
        { region: 'Europe', sales: 98000, target: 110000, trend: 'down' },
        { region: 'Asia Pacific', sales: 156000, target: 150000, trend: 'up' },
        { region: 'Latin America', sales: 67000, target: 70000, trend: 'stable' },
        { region: 'Middle East', sales: 45000, target: 50000, trend: 'down' }
    ]
});
```

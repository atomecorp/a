




// Create draggable objects
const obj1 = new A({
  attach: 'drag_1', // Attach to your container
  id: 'draggable_1',
  markup: 'div',
  type: 'container',
  x: 20,
  y: 30,
  width: 100,
  height: 100,
  backgroundColor: '#3498db',
  smooth: 5,
  content: 'Drag Me'
});

const obj2 = new A({
  attach: 'drag_1',
  id: 'draggable_2',
  markup: 'div',
  type: 'container',
  x: 140,
  y: 30,
  width: 80,
  height: 80,
  backgroundColor: '#e74c3c',
  smooth: 5,
  content: 'Drag Me'
});
// Create a listing array similar to the Ruby version
const listing = [
  { smooth: '100%' },
  { color: 'red', data: 'data_put_inside' },
  {},
  {},
  { width: 33 },
  {}
];

// Define the equivalent method to my_method
function myMethod(val = null) {
  // Assuming A.flash is similar to the Ruby version
  console.log(`so_cool : ${val}`);
}
// Simplified version with two lists and simple positioning

// Create first list (equivalent to list_1 in Ruby)
list_1 = new A({
  attach: 'body',
  id: 'list_1',
  markup: 'div',
  x: 100,
  y: 800,
  width: 200,
  height: 200,
  backgroundColor: '#e0e0e0',
  border: '1px solid black'
})

// Create an item in list_1
list_1_title = new A({
  attach: 'list_1',
  id: 'list_1_title',
  markup: 'div',
  x: 0,
  y: 0,
  width: '100%',
  height: 40,
  backgroundColor: '#333',
  text: 'List 1',
  color: 'white',
  textAlign: 'center'
})

// Create second list (equivalent to list_2 in Ruby)
list_2 = new A({
  attach: 'body',
  id: 'list_2',
  markup: 'div',
  x: 350,
  y: 800,
  width: 200,
  height: 200,
  backgroundColor: '#f5f5f5',
  border: '1px solid black'
})

// Create an item in list_2
list_2_title = new A({
  attach: 'list_2',
  id: 'list_2_title',
  markup: 'div',
  x: 0,
  y: 0,
  width: '100%',
  height: 40,
  backgroundColor: '#333',
  text: 'List 2',
  color: 'white',
  textAlign: 'center'
})

// Use a setTimeout for the positioning (similar to the wait in Ruby)
setTimeout(function() {
  // Position list_2 relative to list_1's width
  list_2.x(list_1.x() + list_1.width() + 20)
  list_2_title.text('List 2 (Moved)')
}, 1000)
// Create a simple circle component
my_circle = new A({
  attach: 'body',
  id: 'my_circle',
  markup: 'div',
  x: 100,
  y: 65,
  width: 22,
  height: 22,
  backgroundColor: 'red',
  smooth: '100%'
})

// Add a click handler to the circle
my_circle.element.onclick = function() {
  alert('okk')
}

// Create a simple table
let y_table = new A({
  attach: 'body',
  id: 'my_test_box',
  markup: 'div',
  type: 'table',
  x: 603,
  y: 550,
  width: 300,
  height: 350,
  smooth: 15,
  overflow: 'scroll',
  backgroundColor: 'white',
  border: '5px dotted black'
})

// Create a table header
table_header = new A({
  attach: 'my_test_box',
  id: 'table_header',
  markup: 'div',
  x: 0,
  y: 0,
  width: '100%',
  height: 50,
  backgroundColor: '#333',
  color: 'white'
})

// Create header cells
header_cell1 = new A({
  attach: 'table_header',
  id: 'header_cell1',
  markup: 'div',
  x: 0,
  y: 0,
  width: 120,
  height: 50,
  text: 'ID',
  textAlign: 'center',
  lineHeight: '50px',
  borderRight: '1px solid white'
})

header_cell2 = new A({
  attach: 'table_header',
  id: 'header_cell2',
  markup: 'div',
  x: 120,
  y: 0,
  width: 200,
  height: 50,
  text: 'Name',
  textAlign: 'center',
  lineHeight: '50px',
  borderRight: '1px solid white'
})

header_cell3 = new A({
  attach: 'table_header',
  id: 'header_cell3',
  markup: 'div',
  x: 320,
  y: 0,
  width: 120,
  height: 50,
  text: 'Age',
  textAlign: 'center',
  lineHeight: '50px'
})

// Create table rows with data
// Row 1
row1 = new A({
  attach: 'my_test_box',
  id: 'row1',
  markup: 'div',
  x: 0,
  y: 50,
  width: '100%',
  height: 50,
  backgroundColor: '#f5f5f5'
})

cell1_1 = new A({
  attach: 'row1',
  id: 'cell1_1',
  markup: 'div',
  x: 0,
  y: 0,
  width: 120,
  height: 50,
  text: '1',
  textAlign: 'center',
  lineHeight: '50px',
  borderRight: '1px solid #ddd'
})

cell1_2 = new A({
  attach: 'row1',
  id: 'cell1_2',
  markup: 'div',
  x: 120,
  y: 0,
  width: 200,
  height: 50,
  text: 'Alice',
  textAlign: 'center',
  lineHeight: '50px',
  borderRight: '1px solid #ddd'
})

cell1_3 = new A({
  attach: 'row1',
  id: 'cell1_3',
  markup: 'div',
  x: 320,
  y: 0,
  width: 120,
  height: 50,
  text: '30',
  textAlign: 'center',
  lineHeight: '50px'
})

// Row 2
row2 = new A({
  attach: 'my_test_box',
  id: 'row2',
  markup: 'div',
  x: 0,
  y: 100,
  width: '100%',
  height: 50,
  backgroundColor: 'white'
})

cell2_1 = new A({
  attach: 'row2',
  id: 'cell2_1',
  markup: 'div',
  x: 0,
  y: 0,
  width: 120,
  height: 50,
  text: '2',
  textAlign: 'center',
  lineHeight: '50px',
  borderRight: '1px solid #ddd'
})

cell2_2 = new A({
  attach: 'row2',
  id: 'cell2_2',
  markup: 'div',
  x: 120,
  y: 0,
  width: 200,
  height: 50,
  text: 'Bob',
  textAlign: 'center',
  lineHeight: '50px',
  borderRight: '1px solid #ddd'
})

cell2_3 = new A({
  attach: 'row2',
  id: 'cell2_3',
  markup: 'div',
  x: 320,
  y: 0,
  width: 120,
  height: 50,
  text: '22',
  textAlign: 'center',
  lineHeight: '50px'
})

// Row 3 with circle reference
row3 = new A({
  attach: 'my_test_box',
  id: 'row3',
  markup: 'div',
  x: 0,
  y: 150,
  width: '100%',
  height: 50,
  backgroundColor: '#f5f5f5'
})

cell3_1 = new A({
  attach: 'row3',
  id: 'cell3_1',
  markup: 'div',
  x: 0,
  y: 0,
  width: 120,
  height: 50,
  text: '3',
  textAlign: 'center',
  lineHeight: '50px',
  borderRight: '1px solid #ddd'
})

cell3_2 = new A({
  attach: 'row3',
  id: 'cell3_2',
  markup: 'div',
  x: 120,
  y: 0,
  width: 200,
  height: 50,
  text: 'Vincent',
  textAlign: 'center',
  lineHeight: '50px',
  borderRight: '1px solid #ddd'
})

cell3_3 = new A({
  attach: 'row3',
  id: 'cell3_3',
  markup: 'div',
  x: 320,
  y: 0,
  width: 120,
  height: 50,
  text: '33',
  textAlign: 'center',
  lineHeight: '50px'
})

// Update table color
// setTimeout(function() {
//   my_table.backgroundColor('cyan')
// }, 1000)
// Create a draggable element
let draggable = new A({
  attach: 'body',
  id: 'draggable_item',
  markup: 'div',
  x: 200,
  y: 200,
  width: 100,
  height: 100,
  backgroundColor: 'orange',
  smooth: 10,
  text: 'Drag Me',
  textAlign: 'center',
  lineHeight: '100px',
  color: 'white',
  cursor: 'pointer',
  border: '2px solid #ff7700'
})

// Create a drop target
let drop_target = new A({
  attach: 'body',
  id: 'drop_target',
  markup: 'div',
  x: 400,
  y: 400,
  width: 200,
  height: 200,
  backgroundColor: 'lightblue',
  smooth: 10,
  text: 'Drop Here',
  textAlign: 'center',
  lineHeight: '200px',
  color: 'white',
  border: '2px dashed blue'
})

// Variables to track dragging state
let is_dragging = false
let drag_offset_x = 0
let drag_offset_y = 0

// Add mousedown event to start dragging
draggable.element.onmousedown = function(e) {
  is_dragging = true

  // Calculate the offset between mouse position and element position
  drag_offset_x = e.clientX - draggable.x()
  drag_offset_y = e.clientY - draggable.y()

  // Change appearance during drag
  draggable.backgroundColor('red')

  // Prevent default browser behavior
  e.preventDefault()
}

// Add mousemove event to the document
document.onmousemove = function(e) {
  if (is_dragging) {
    // Update position based on mouse coordinates and offset
    draggable.x(e.clientX - drag_offset_x)
    draggable.y(e.clientY - drag_offset_y)
  }
}

// Add mouseup event to stop dragging
document.onmouseup = function(e) {
  if (is_dragging) {
    is_dragging = false

    // Reset appearance
    draggable.backgroundColor('orange')

    // Check if it was dropped on the target
    check_drop()
  }
}

// Function to check if the draggable was dropped on the target
function check_drop() {
  // Get positions and dimensions
  let drag_x = draggable.x()
  let drag_y = draggable.y()
  let drag_width = draggable.width()
  let drag_height = draggable.height()

  let target_x = drop_target.x()
  let target_y = drop_target.y()
  let target_width = drop_target.width()
  let target_height = drop_target.height()

  // Check for overlap
  if (
      drag_x < target_x + target_width &&
      drag_x + drag_width > target_x &&
      drag_y < target_y + target_height &&
      drag_y + drag_height > target_y
  ) {
    // Successful drop - center the item in the drop zone
    draggable.x(target_x + (target_width - drag_width) / 2)
    draggable.y(target_y + (target_height - drag_height) / 2)

    // Change appearance to indicate successful drop
    draggable.backgroundColor('green')
    draggable.text('Dropped!')
    drop_target.text('Success!')
    drop_target.backgroundColor('lightgreen')
  }
}
// Create a content editable component
let editor = new A({
  attach: 'body',
  id: 'content_editor',
  markup: 'div',
  x: 100,
  y: 400,
  width: 400,
  height: 200,
  backgroundColor: 'white',
  smooth: 10,
  border: '1px solid #ccc',
  padding: 10,
  text: 'Click here to edit this text...',
  overflow: 'auto'
})

// Make the element content editable
editor.element.contentEditable = 'true'

// Add styling properties specific to editable content
editor.element.style.outline = 'none' // Remove the default outline
editor.element.style.wordWrap = 'break-word' // Enable word wrapping

// Add a title/header above the editor
editor_title = new A({
  attach: 'body',
  id: 'editor_title',
  markup: 'div',
  x: 100,
  y: 360,
  width: 400,
  height: 40,
  backgroundColor: '#2c3e50',
  text: 'Content Editable Editor',
  color: 'white',
  textAlign: 'center',
  lineHeight: '40px',
  smooth: '5px 5px 0 0' // Round top corners only
})

// Save button - positioned to the right of the editor
save_button = new A({
  attach: 'body',
  id: 'save_button',
  markup: 'div',
  x: 510, // Just to the right of the editor (100 + 400 + 10)
  y: 400, // Same y position as the editor
  width: 80,
  height: 40,
  backgroundColor: '#4CAF50',
  text: 'Save',
  color: 'white',
  textAlign: 'center',
  lineHeight: '40px',
  cursor: 'pointer',
  smooth: 5
})

// Add event handler for the save button
save_button.element.onclick = function() {
  // Get the content and show an alert
  // Avoid creating a new variable named 'content'
  alert('Content saved:\n\n' + editor.element.innerHTML)
}

// Add focus and blur events for visual feedback
editor.element.onfocus = function() {
  editor.border('1px solid #3498db')
}

editor.element.onblur = function() {
  editor.border('1px solid #ccc')
}

// Add a status indicator for counting characters below the editor
status_bar = new A({
  attach: 'body',
  id: 'status_bar',
  markup: 'div',
  x: 100,
  y: 610, // Just below the editor (400 + 200 + 10)
  width: 400,
  height: 30,
  backgroundColor: '#f8f8f8',
  text: '0 characters',
  textAlign: 'right',
  lineHeight: '30px',
  padding: '0 10px',
  color: '#666',
  fontSize: 12,
  border: '1px solid #ccc',
  borderTop: 'none'
})

// Update character count on input
editor.element.oninput = function() {
  // Directly update the text without creating a 'count' variable
  status_bar.text(editor.element.innerText.length + ' characters')
}

// Optional: Add a toolbar with formatting buttons
toolbar = new A({
  attach: 'body',
  id: 'editor_toolbar',
  markup: 'div',
  x: 100,
  y: 580, // Just below the editor (400 + 200 - 20)
  width: 400,
  height: 30,
  backgroundColor: '#f1f1f1',
  border: '1px solid #ccc',
  borderTop: 'none'
})

// Bold button
bold_button = new A({
  attach: 'editor_toolbar',
  id: 'bold_button',
  markup: 'div',
  x: 10,
  y: 5,
  width: 20,
  height: 20,
  backgroundColor: '#ddd',
  text: 'B',
  fontWeight: 'bold',
  textAlign: 'center',
  lineHeight: '20px',
  cursor: 'pointer',
  smooth: 3
})

// Italic button
italic_button = new A({
  attach: 'editor_toolbar',
  id: 'italic_button',
  markup: 'div',
  x: 40,
  y: 5,
  width: 20,
  height: 20,
  backgroundColor: '#ddd',
  text: 'I',
  fontStyle: 'italic',
  textAlign: 'center',
  lineHeight: '20px',
  cursor: 'pointer',
  smooth: 3
})

// Underline button
underline_button = new A({
  attach: 'editor_toolbar',
  id: 'underline_button',
  markup: 'div',
  x: 70,
  y: 5,
  width: 20,
  height: 20,
  backgroundColor: '#ddd',
  text: 'U',
  textDecoration: 'underline',
  textAlign: 'center',
  lineHeight: '20px',
  cursor: 'pointer',
  smooth: 3
})

// Add event handlers for the buttons
bold_button.element.onclick = function() {
  document.execCommand('bold', false, null)
  editor.element.focus()
}

italic_button.element.onclick = function() {
  document.execCommand('italic', false, null)
  editor.element.focus()
}

underline_button.element.onclick = function() {
  document.execCommand('underline', false, null)
  editor.element.focus()
}

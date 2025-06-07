
editor = new A({
    attach: 'body',
    id: 'content_editor',
    markup: 'div',
    x: 100,
    y: 200,
    width: 400,
    height: 100,
    backgroundColor: 'white',
    smooth: 10,
    border: '1px solid #ccc',
    padding: 10,
    text: 'Type here and press Enter to send...'
})

// Make the element content editable
editor.element.contentEditable = 'true'

// Add styling
editor.element.style.outline = 'none'

// Create a response area
response_area = new A({
    attach: 'body',
    id: 'response_area',
    markup: 'div',
    x: 100,
    y: 350,
    width: 400,
    height: 200,
    backgroundColor: '#f5f5f5',
    smooth: 10,
    border: '1px solid #ccc',
    padding: 10,
    overflow: 'auto'
})

// Create a label for the response area
response_label = new A({
    attach: 'body',
    id: 'response_label',
    markup: 'div',
    x: 100,
    y: 320,
    width: 400,
    height: 30,
    text: 'Server Responses:',
    textAlign: 'left',
    lineHeight: '30px',
    fontWeight: 'bold'
})

// Create a status indicator
status_dot = new A({
    attach: 'body',
    id: 'status_dot',
    markup: 'div',
    x: 520,
    y: 200,
    width: 20,
    height: 20,
    backgroundColor: 'red',
    smooth: '50%'
})

// Create WebSocket connection
ws_status = 'disconnected'

// Function to add message to response area
function addResponse(message) {
    // Create paragraph element
    msg_element = document.createElement('p')
    msg_element.style.margin = '5px 0'
    msg_element.textContent = message

    // Add to response area
    response_area.element.appendChild(msg_element)

    // Scroll to bottom
    response_area.element.scrollTop = response_area.element.scrollHeight
}

// Simulate WebSocket behavior since we don't have a server
function simulateWebSocket() {
    // Change status to connected
    ws_status = 'connected'
    status_dot.backgroundColor('green')

    // Add connection message
    addResponse('Connected to server')
}

// Handler for keydown events
editor.element.onkeydown = function(e) {
    // Check if Enter key was pressed (key code 13)
    if (e.keyCode === 13) {
        // Prevent default behavior (newline)
        e.preventDefault()

        // Get the message
        message = editor.element.textContent

        // Add user message to response area
        addResponse('You: ' + message)

        // Check connection status
        if (ws_status === 'connected') {
            // Simulate server response
            setTimeout(function() {
                addResponse('Server: Received your message: "' + message + '"')
            }, 500)
        } else {
            addResponse('Error: Not connected to server')
        }

        // Clear editor
        editor.element.textContent = ''
    }
}

// Create connect button
connect_button = new A({
    attach: 'body',
    id: 'connect_button',
    markup: 'div',
    x: 520,
    y: 230,
    width: 100,
    height: 40,
    backgroundColor: '#2ecc71',
    smooth: 5,
    text: 'Connect',
    textAlign: 'center',
    lineHeight: '40px',
    color: 'white',
    cursor: 'pointer'
})

// Add click handler for connect button
connect_button.element.onclick = function() {
    simulateWebSocket()
}
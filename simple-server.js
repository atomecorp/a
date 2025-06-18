import http from 'http';
import fs from 'fs';
import path from 'path';
import url from 'url';

const port = 8080;
const baseDir = process.cwd();

// MIME types
const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.wav': 'audio/wav',
    '.mp4': 'video/mp4',
    '.woff': 'application/font-woff',
    '.ttf': 'application/font-ttf',
    '.eot': 'application/vnd.ms-fontobject',
    '.otf': 'application/font-otf',
    '.wasm': 'application/wasm'
};

const server = http.createServer((req, res) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    
    // Parse URL
    const parsedUrl = url.parse(req.url);
    let pathname = parsedUrl.pathname;
    
    // Default to index.html for directories
    if (pathname === '/') {
        pathname = '/src/index.html';
    } else if (pathname.endsWith('/')) {
        pathname += 'index.html';
    }
    
    // Construct file path
    const filePath = path.join(baseDir, pathname.substring(1));
    
    // Check if file exists
    fs.access(filePath, fs.constants.F_OK, (err) => {
        if (err) {
            console.log(`File not found: ${filePath}`);
            res.writeHead(404, { 'Content-Type': 'text/html' });
            res.end(`
                <html>
                    <body>
                        <h1>404 - File Not Found</h1>
                        <p>Could not find: ${pathname}</p>
                        <p>Looking for: ${filePath}</p>
                        <a href="/src/js_library/leaflet/">Go to Leaflet Tests</a>
                    </body>
                </html>
            `);
            return;
        }
        
        // Get file extension and mime type
        const ext = path.extname(filePath).toLowerCase();
        const mimeType = mimeTypes[ext] || 'application/octet-stream';
        
        // Read and serve file
        fs.readFile(filePath, (err, data) => {
            if (err) {
                console.log(`Error reading file: ${err}`);
                res.writeHead(500, { 'Content-Type': 'text/html' });
                res.end('<h1>500 - Internal Server Error</h1>');
                return;
            }
            
            res.writeHead(200, { 
                'Content-Type': mimeType,
                'Access-Control-Allow-Origin': '*'
            });
            res.end(data);
        });
    });
});

server.listen(port, () => {
    console.log(`🚀 Static file server running at http://localhost:${port}`);
    console.log(`📁 Serving files from: ${baseDir}`);
    console.log(`🗺️ Leaflet tests: http://localhost:${port}/src/js_library/leaflet/`);
    console.log(`🧪 Test selector: http://localhost:${port}/src/js_library/leaflet/test-selector.html`);
});

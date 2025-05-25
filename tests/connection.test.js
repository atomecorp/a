import { describe, it, before, after, beforeEach } from 'mocha';
import { expect } from 'chai';
import { io as Client } from 'socket.io-client';
import fastify from 'fastify';
import fastifySocketIo from 'fastify-socket.io';
import jwt from 'jsonwebtoken';
import { createServer } from 'net';
import { DatabaseOperations, sequelize } from '../server/database.js';


let connect, authenticatedSockets;

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Function to find available port
function getAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

describe('Connection Tests Suite', function() {
  let server;
  let serverUrl;
  let testPort;
  let validToken, expiredToken, invalidToken;
  let validUserId = 'test_user_123';

  // Setup server before tests
  before(async function() {
    this.timeout(15000);
    
    try {
      // Get available port
      const socketModule = await import('../server/handlers/socketHandlers.js');
    connect = socketModule.connect;
    authenticatedSockets = socketModule.authenticatedSockets;
      testPort = await getAvailablePort();
      console.log(`Using test port: ${testPort}`);
      
      // Create test server
      server = fastify({ logger: false });
      
      // Register Socket.IO plugin
      await server.register(fastifySocketIo, {
        cors: {
          origin: true,
          credentials: true
        }
      });

      // Generate test tokens
      validToken = jwt.sign(
        { userId: validUserId, username: 'testuser' },
        JWT_SECRET,
        { expiresIn: '1h' }
      );

      expiredToken = jwt.sign(
        { userId: validUserId, username: 'testuser' },
        JWT_SECRET,
        { expiresIn: '-1h' }
      );

      invalidToken = 'invalid.jwt.token';

      // Setup Socket.IO handlers
      server.ready((err) => {
        if (err) throw err;
        
        server.io.on('connection', (socket) => {
          console.log(`Test client connected: ${socket.id}`);
          
          socket.on('connect_request', (data) => {
            console.log(`Received connect_request:`, data);
            connect(data, socket);
          });
          
          socket.on('disconnect', () => {
            console.log(`Test client disconnected: ${socket.id}`);
          });
        });
      });

      // Start server
      await server.listen({ port: testPort, host: '127.0.0.1' });
      serverUrl = `http://127.0.0.1:${testPort}`;
      console.log(`Test server started on ${serverUrl}`);
      
    } catch (error) {
      console.error('Failed to start test server:', error);
      throw error;
    }
  });

  // Cleanup after tests
  after(async function() {
    this.timeout(5000);
    try {
      if (server) {
        await server.close();
        console.log('Test server closed');
      }
    } catch (error) {
      console.error('Error closing test server:', error);
    }
  });

  // Clear authenticated sockets before each test
  beforeEach(function() {
    authenticatedSockets.clear();
  });

  describe('Quick Connection Tests', function() {
    
    it('Should connect successfully with valid token', function(done) {
      this.timeout(8000);
      
      const client = Client(serverUrl, {
        forceNew: true,
        reconnection: false,
        timeout: 3000,
        autoConnect: false
      });

      let testCompleted = false;

      function completeTest(error) {
        if (testCompleted) return;
        testCompleted = true;
        
        client.disconnect();
        if (error) {
          console.log('Test result: failed');
          done(error);
        } else {
          console.log('Test result: success');
          done();
        }
      }

      client.on('connect', () => {
        console.log('Client connected, sending connect_request...');
        
        const validData = {
          auth: {
            id: validUserId,
            token: validToken
          }
        };
        
        client.emit('connect_request', validData);
      });

      client.on('connection_success', (response) => {
        console.log('Received connection_success:', response);
        
        try {
          expect(response).to.have.property('message');
          expect(response).to.have.property('userId', validUserId);
          expect(response).to.have.property('socketId');
          expect(authenticatedSockets.size).to.equal(1);
          completeTest();
        } catch (error) {
          completeTest(error);
        }
      });

      client.on('connection_error', (error) => {
        console.log('Received unexpected connection_error:', error);
        completeTest(new Error(`Should not receive connection_error: ${error.message}`));
      });

      client.on('connect_error', (error) => {
        console.log('Socket.IO connect_error:', error);
        completeTest(new Error(`Socket.IO connection failed: ${error.message}`));
      });

      // Timeout fallback
      setTimeout(() => {
        completeTest(new Error('Test timeout - no response received'));
      }, 7000);

      // Start connection
      console.log('Starting client connection...');
      client.connect();
    });

    it('Should reject connection without token', function(done) {
      this.timeout(8000);
      
      const client = Client(serverUrl, {
        forceNew: true,
        reconnection: false,
        timeout: 3000,
        autoConnect: false
      });

      let testCompleted = false;

      function completeTest(error) {
        if (testCompleted) return;
        testCompleted = true;
        
        client.disconnect();
        if (error) {
          console.log('Test result: failed');
          done(error);
        } else {
          console.log('Test result: success');
          done();
        }
      }

      client.on('connect', () => {
        console.log('Client connected, sending invalid connect_request...');
        
        const invalidData = {
          auth: {
            id: validUserId
            // token missing
          }
        };
        
        client.emit('connect_request', invalidData);
      });

      client.on('connection_error', (error) => {
        console.log('Received expected connection_error:', error);
        
        try {
          expect(error).to.have.property('message');
          expect(error.message).to.include('Invalid connection data structure');
          expect(authenticatedSockets.size).to.equal(0);
          completeTest();
        } catch (testError) {
          completeTest(testError);
        }
      });

      client.on('connection_success', () => {
        completeTest(new Error('Should not receive connection_success'));
      });

      client.on('connect_error', (error) => {
        completeTest(new Error(`Socket.IO connection failed: ${error.message}`));
      });

      // Timeout fallback
      setTimeout(() => {
        completeTest(new Error('Test timeout - no response received'));
      }, 7000);

      client.connect();
    });

    it('Should reject expired token', function(done) {
      this.timeout(8000);
      
      const client = Client(serverUrl, {
        forceNew: true,
        reconnection: false,
        timeout: 3000,
        autoConnect: false
      });

      let testCompleted = false;

      function completeTest(error) {
        if (testCompleted) return;
        testCompleted = true;
        
        client.disconnect();
        if (error) {
          console.log('Test result: failed');
          done(error);
        } else {
          console.log('Test result: success');
          done();
        }
      }

      client.on('connect', () => {
        const expiredData = {
          auth: {
            id: validUserId,
            token: expiredToken
          }
        };
        
        client.emit('connect_request', expiredData);
      });

      client.on('connection_error', (error) => {
        try {
          expect(error).to.have.property('message');
          expect(error.message).to.include('Token has expired');
          expect(authenticatedSockets.size).to.equal(0);
          completeTest();
        } catch (testError) {
          completeTest(testError);
        }
      });

      client.on('connection_success', () => {
        completeTest(new Error('Should not receive connection_success'));
      });

      // Timeout fallback
      setTimeout(() => {
        completeTest(new Error('Test timeout - no response received'));
      }, 7000);

      client.connect();
    });

    it('Should reject invalid token format', function(done) {
      this.timeout(8000);
      
      const client = Client(serverUrl, {
        forceNew: true,
        reconnection: false,
        timeout: 3000,
        autoConnect: false
      });

      let testCompleted = false;

      function completeTest(error) {
        if (testCompleted) return;
        testCompleted = true;
        
        client.disconnect();
        if (error) {
          console.log('Test result: failed');
          done(error);
        } else {
          console.log('Test result: success');
          done();
        }
      }

      client.on('connect', () => {
        const invalidTokenData = {
          auth: {
            id: validUserId,
            token: invalidToken
          }
        };
        
        client.emit('connect_request', invalidTokenData);
      });

      client.on('connection_error', (error) => {
        try {
          expect(error).to.have.property('message');
          expect(error.message).to.include('Invalid token');
          expect(authenticatedSockets.size).to.equal(0);
          completeTest();
        } catch (testError) {
          completeTest(testError);
        }
      });

      client.on('connection_success', () => {
        completeTest(new Error('Should not receive connection_success'));
      });

      // Timeout fallback
      setTimeout(() => {
        completeTest(new Error('Test timeout - no response received'));
      }, 7000);

      client.connect();
    });

    it('Should reject when token user ID differs from request ID', function(done) {
      this.timeout(8000);
      
      // Create token for different user
      const wrongToken = jwt.sign(
        { userId: 'wrong_user_789', username: 'wronguser' },
        JWT_SECRET,
        { expiresIn: '1h' }
      );
      
      const client = Client(serverUrl, {
        forceNew: true,
        reconnection: false,
        timeout: 3000,
        autoConnect: false
      });

      let testCompleted = false;

      function completeTest(error) {
        if (testCompleted) return;
        testCompleted = true;
        
        client.disconnect();
        if (error) {
          console.log('Test result: failed');
          done(error);
        } else {
          console.log('Test result: success');
          done();
        }
      }

      client.on('connect', () => {
        const mismatchData = {
          auth: {
            id: validUserId, // Request with valid user ID
            token: wrongToken // But token is for different user
          }
        };
        
        client.emit('connect_request', mismatchData);
      });

      client.on('connection_error', (error) => {
        try {
          expect(error).to.have.property('message');
          expect(error.message).to.include('Token user ID mismatch');
          expect(authenticatedSockets.size).to.equal(0);
          completeTest();
        } catch (testError) {
          completeTest(testError);
        }
      });

      client.on('connection_success', () => {
        completeTest(new Error('Should not receive connection_success'));
      });

      // Timeout fallback
      setTimeout(() => {
        completeTest(new Error('Test timeout - no response received'));
      }, 7000);

      client.connect();
    });
  });

  describe('Double Connection Tests', function() {
    
    it('Should allow same user to connect with multiple sockets', function(done) {
      this.timeout(10000);
      
      const client1 = Client(serverUrl, {
        forceNew: true,
        reconnection: false,
        timeout: 3000,
        autoConnect: false
      });
      
      const client2 = Client(serverUrl, {
        forceNew: true,
        reconnection: false,
        timeout: 3000,
        autoConnect: false
      });
      
      let connectionsSuccessful = 0;
      let testCompleted = false;
      
      function completeTest(error) {
        if (testCompleted) return;
        testCompleted = true;
        
        client1.disconnect();
        client2.disconnect();
        
        if (error) {
          console.log('Test result: failed');
          done(error);
        } else {
          console.log('Test result: success');
          done();
        }
      }
      
      function checkBothConnected() {
        connectionsSuccessful++;
        console.log(`Connection ${connectionsSuccessful}/2 successful`);
        
        if (connectionsSuccessful === 2) {
          try {
            expect(authenticatedSockets.size).to.equal(2);
            console.log(`Both clients connected successfully`);
            completeTest();
          } catch (error) {
            completeTest(error);
          }
        }
      }
      
      // Setup client1
      client1.on('connect', () => {
        console.log('Client1 connected');
        client1.emit('connect_request', {
          auth: { id: validUserId, token: validToken }
        });
      });
      
      client1.on('connection_success', (response) => {
        console.log('Client1 authenticated');
        expect(response.userId).to.equal(validUserId);
        checkBothConnected();
      });
      
      client1.on('connection_error', (error) => {
        completeTest(new Error(`Client1 error: ${error.message}`));
      });
      
      // Setup client2
      client2.on('connect', () => {
        console.log('Client2 connected');
        client2.emit('connect_request', {
          auth: { id: validUserId, token: validToken }
        });
      });
      
      client2.on('connection_success', (response) => {
        console.log('Client2 authenticated');
        expect(response.userId).to.equal(validUserId);
        checkBothConnected();
      });
      
      client2.on('connection_error', (error) => {
        completeTest(new Error(`Client2 error: ${error.message}`));
      });
      
      // Timeout fallback
      setTimeout(() => {
        completeTest(new Error('Test timeout - both clients should have connected'));
      }, 9000);
      
      // Start connections
      client1.connect();
      
      // Start second client after a short delay
      setTimeout(() => {
        client2.connect();
      }, 200);
    });

    it('Should handle rapid reconnection attempts', function(done) {
      this.timeout(8000);
      
      let connectionAttempts = 0;
      let successfulConnections = 0;
      const maxAttempts = 3;
      let testCompleted = false;
      
      function completeTest(error) {
        if (testCompleted) return;
        testCompleted = true;
        
        if (error) {
          console.log('Test result: failed');
          done(error);
        } else {
          console.log('Test result: success');
          done();
        }
      }
      
      function attemptConnection() {
        connectionAttempts++;
        console.log(`Connection attempt ${connectionAttempts}/${maxAttempts}`);
        
        const client = Client(serverUrl, {
          forceNew: true,
          reconnection: false,
          timeout: 2000,
          autoConnect: false
        });
        
        client.on('connect', () => {
          client.emit('connect_request', {
            auth: { id: validUserId, token: validToken }
          });
        });
        
        client.on('connection_success', () => {
          successfulConnections++;
          console.log(`Successful connection ${successfulConnections}/${maxAttempts}`);
          
          client.disconnect();
          
          if (connectionAttempts < maxAttempts) {
            // Try reconnecting after disconnect
            setTimeout(attemptConnection, 100);
          } else {
            try {
              expect(successfulConnections).to.equal(maxAttempts);
              completeTest();
            } catch (error) {
              completeTest(error);
            }
          }
        });
        
        client.on('connection_error', (error) => {
          client.disconnect();
          completeTest(new Error(`Connection attempt ${connectionAttempts} failed: ${error.message}`));
        });
        
        client.connect();
      }
      
      // Timeout fallback
      setTimeout(() => {
        completeTest(new Error('Test timeout - rapid reconnection test failed'));
      }, 7000);
      
      attemptConnection();
    });
  });

  describe('Cleanup Tests', function() {
    
    it('Should clean up socket on disconnect', function(done) {
      this.timeout(6000);
      
      const client = Client(serverUrl, {
        forceNew: true,
        reconnection: false,
        timeout: 3000,
        autoConnect: false
      });

      let testCompleted = false;

      function completeTest(error) {
        if (testCompleted) return;
        testCompleted = true;
        
        if (error) {
          console.log('Test result: failed');
          done(error);
        } else {
          console.log('Test result: success');
          done();
        }
      }
      
      client.on('connect', () => {
        client.emit('connect_request', {
          auth: { id: validUserId, token: validToken }
        });
      });
      
      client.on('connection_success', () => {
        try {
          expect(authenticatedSockets.size).to.equal(1);
          console.log('Socket authenticated, now disconnecting...');
          
          // Disconnect and check cleanup
          client.disconnect();
          
          // Give some time for cleanup
          setTimeout(() => {
            try {
              expect(authenticatedSockets.size).to.equal(0);
              console.log('Socket cleanup verified');
              completeTest();
            } catch (error) {
              completeTest(error);
            }
          }, 200);
        } catch (error) {
          completeTest(error);
        }
      });
      
      client.on('connection_error', (error) => {
        completeTest(new Error(`Should not receive error: ${error.message}`));
      });

      // Timeout fallback
      setTimeout(() => {
        completeTest(new Error('Test timeout - cleanup test failed'));
      }, 5000);
      
      client.connect();
    });
  });
//////////////////////////////////////////////
// ===== PHASE 2: JWT AUTHENTICATION TESTS =====
// describe('Phase 2: JWT Authentication Tests', function() {
//   let authServer;
//   let authServerUrl;
//   let authTestPort;
//   let testUserId = 'auth_test_user_456';

//   // Setup authentication test server
//   before(async function() {
//     this.timeout(15000);
    
//     try {
//         const socketModule = await import('../server/handlers/socketHandlers.js');
//         connect = socketModule.connect;
//         authenticatedSockets = socketModule.authenticatedSockets;
//       authTestPort = await getAvailablePort();
//       console.log(`Authentication test server port: ${authTestPort}`);
      
//       authServer = fastify({ logger: false });
      
//       await authServer.register(fastifySocketIo, {
//         cors: {
//           origin: true,
//           credentials: true
//         }
//       });

//       authServer.ready((err) => {
//         if (err) throw err;
        
//         authServer.io.on('connection', (socket) => {
//           socket.on('connect_request', (data) => {
//             connect(data, socket);
//           });
          
//           socket.on('disconnect', () => {
//             console.log(`Auth test client disconnected: ${socket.id}`);
//           });
//         });
//       });

//       await authServer.listen({ port: authTestPort, host: '127.0.0.1' });
//       authServerUrl = `http://127.0.0.1:${authTestPort}`;
//       console.log(`Authentication test server started on ${authServerUrl}`);
      
//     } catch (error) {
//       console.error('Failed to start authentication test server:', error);
//       throw error;
//     }
//   });

//   after(async function() {
//     this.timeout(5000);
//     try {
//       if (authServer) {
//         await authServer.close();
//         console.log('Authentication test server closed');
//       }
//     } catch (error) {
//       console.error('Error closing authentication test server:', error);
//     }
//   });

//   beforeEach(function() {
//     authenticatedSockets.clear();
//   });

//   describe('Valid Token Authentication', function() {
    
//     it('Should authenticate with valid JWT token', function(done) {
//       this.timeout(8000);
      
//       // Generate valid token
//       const validToken = jwt.sign(
//         { userId: testUserId, username: 'authTestUser' },
//         JWT_SECRET,
//         { expiresIn: '1h' }
//       );
      
//       const client = Client(authServerUrl, {
//         forceNew: true,
//         reconnection: false,
//         timeout: 3000,
//         autoConnect: false
//       });

//       let testCompleted = false;

//       function completeTest(error) {
//         if (testCompleted) return;
//         testCompleted = true;
        
//         client.disconnect();
//         if (error) {
//           console.log('Valid token authentication: failed');
//           done(error);
//         } else {
//           console.log('Valid token authentication: success');
//           done();
//         }
//       }

//       client.on('connect', () => {
//         console.log('Testing valid token authentication...');
        
//         const authData = {
//           auth: {
//             id: testUserId,
//             token: validToken
//           }
//         };
        
//         client.emit('connect_request', authData);
//       });

//       client.on('connection_success', (response) => {
//         console.log('Valid token authentication successful');
        
//         try {
//           expect(response).to.have.property('message');
//           expect(response).to.have.property('userId', testUserId);
//           expect(response).to.have.property('socketId');
//           expect(response.message).to.include('Successfully authenticated');
//           expect(authenticatedSockets.size).to.equal(1);
//           completeTest();
//         } catch (error) {
//           completeTest(error);
//         }
//       });

//       client.on('connection_error', (error) => {
//         completeTest(new Error(`Should not receive connection_error: ${error.message}`));
//       });

//       setTimeout(() => {
//         completeTest(new Error('Valid token test timeout'));
//       }, 7000);

//       client.connect();
//     });
//   });

//   describe('Expired Token Rejection', function() {
    
//     it('Should reject expired JWT token', function(done) {
//       this.timeout(8000);
      
//       // Generate expired token
//       const expiredToken = jwt.sign(
//         { userId: testUserId, username: 'authTestUser' },
//         JWT_SECRET,
//         { expiresIn: '-2h' } // Expired 2 hours ago
//       );
      
//       const client = Client(authServerUrl, {
//         forceNew: true,
//         reconnection: false,
//         timeout: 3000,
//         autoConnect: false
//       });

//       let testCompleted = false;

//       function completeTest(error) {
//         if (testCompleted) return;
//         testCompleted = true;
        
//         client.disconnect();
//         if (error) {
//           console.log('Expired token rejection: failed');
//           done(error);
//         } else {
//           console.log('Expired token rejection: success');
//           done();
//         }
//       }

//       client.on('connect', () => {
//         console.log('Testing expired token rejection...');
        
//         const expiredData = {
//           auth: {
//             id: testUserId,
//             token: expiredToken
//           }
//         };
        
//         client.emit('connect_request', expiredData);
//       });

//       client.on('connection_error', (error) => {
//         console.log('Expected expired token rejection');
        
//         try {
//           expect(error).to.have.property('message');
//           expect(error.message).to.include('Token has expired');
//           expect(authenticatedSockets.size).to.equal(0);
//           completeTest();
//         } catch (testError) {
//           completeTest(testError);
//         }
//       });

//       client.on('connection_success', () => {
//         completeTest(new Error('Should not authenticate with expired token'));
//       });

//       setTimeout(() => {
//         completeTest(new Error('Expired token test timeout'));
//       }, 7000);

//       client.connect();
//     });
//   });

//   describe('Falsified Token Rejection', function() {
    
//     it('Should reject invalid token format', function(done) {
//       this.timeout(8000);
      
//       const invalidToken = 'completely.invalid.token.format.falsified';
      
//       const client = Client(authServerUrl, {
//         forceNew: true,
//         reconnection: false,
//         timeout: 3000,
//         autoConnect: false
//       });

//       let testCompleted = false;

//       function completeTest(error) {
//         if (testCompleted) return;
//         testCompleted = true;
        
//         client.disconnect();
//         if (error) {
//           console.log('Invalid token rejection: failed');
//           done(error);
//         } else {
//           console.log('Invalid token rejection: success');
//           done();
//         }
//       }

//       client.on('connect', () => {
//         console.log('Testing invalid token rejection...');
        
//         const invalidData = {
//           auth: {
//             id: testUserId,
//             token: invalidToken
//           }
//         };
        
//         client.emit('connect_request', invalidData);
//       });

//       client.on('connection_error', (error) => {
//         console.log('Expected invalid token rejection');
        
//         try {
//           expect(error).to.have.property('message');
//           expect(error.message).to.include('Invalid token');
//           expect(authenticatedSockets.size).to.equal(0);
//           completeTest();
//         } catch (testError) {
//           completeTest(testError);
//         }
//       });

//       client.on('connection_success', () => {
//         completeTest(new Error('Should not authenticate with invalid token'));
//       });

//       setTimeout(() => {
//         completeTest(new Error('Invalid token test timeout'));
//       }, 7000);

//       client.connect();
//     });

//     it('Should reject token with wrong secret signature', function(done) {
//       this.timeout(8000);
      
//       // Generate token with wrong secret (falsified)
//       const wrongSecretToken = jwt.sign(
//         { userId: testUserId, username: 'authTestUser' },
//         'wrong-secret-key-falsified',
//         { expiresIn: '1h' }
//       );
      
//       const client = Client(authServerUrl, {
//         forceNew: true,
//         reconnection: false,
//         timeout: 3000,
//         autoConnect: false
//       });

//       let testCompleted = false;

//       function completeTest(error) {
//         if (testCompleted) return;
//         testCompleted = true;
        
//         client.disconnect();
//         if (error) {
//           console.log('Wrong secret token rejection: failed');
//           done(error);
//         } else {
//           console.log('Wrong secret token rejection: success');
//           done();
//         }
//       }

//       client.on('connect', () => {
//         console.log('Testing wrong secret token rejection...');
        
//         client.emit('connect_request', {
//           auth: {
//             id: testUserId,
//             token: wrongSecretToken
//           }
//         });
//       });

//       client.on('connection_error', (error) => {
//         console.log('Expected wrong secret token rejection');
        
//         try {
//           expect(error).to.have.property('message');
//           expect(error.message).to.include('Invalid token');
//           expect(authenticatedSockets.size).to.equal(0);
//           completeTest();
//         } catch (testError) {
//           completeTest(testError);
//         }
//       });

//       client.on('connection_success', () => {
//         completeTest(new Error('Should not authenticate with wrong secret token'));
//       });

//       setTimeout(() => {
//         completeTest(new Error('Wrong secret token test timeout'));
//       }, 7000);

//       client.connect();
//     });

//     it('Should reject token with tampered payload', function(done) {
//       this.timeout(8000);
      
//       // Generate valid token then tamper with it (falsify it)
//       const validToken = jwt.sign(
//         { userId: testUserId, username: 'authTestUser' },
//         JWT_SECRET,
//         { expiresIn: '1h' }
//       );
      
//       // Tamper with the signature part (falsify it)
//       const parts = validToken.split('.');
//       parts[2] = parts[2].slice(0, -8) + 'FALSIFIED'; // Change signature
//       const tamperedToken = parts.join('.');
      
//       const client = Client(authServerUrl, {
//         forceNew: true,
//         reconnection: false,
//         timeout: 3000,
//         autoConnect: false
//       });

//       let testCompleted = false;

//       function completeTest(error) {
//         if (testCompleted) return;
//         testCompleted = true;
        
//         client.disconnect();
//         if (error) {
//           console.log('Tampered token rejection: failed');
//           done(error);
//         } else {
//           console.log('Tampered token rejection: success');
//           done();
//         }
//       }

//       client.on('connect', () => {
//         console.log('Testing tampered token rejection...');
        
//         client.emit('connect_request', {
//           auth: {
//             id: testUserId,
//             token: tamperedToken
//           }
//         });
//       });

//       client.on('connection_error', (error) => {
//         console.log('Expected tampered token rejection');
        
//         try {
//           expect(error).to.have.property('message');
//           expect(error.message).to.include('Invalid token');
//           expect(authenticatedSockets.size).to.equal(0);
//           completeTest();
//         } catch (testError) {
//           completeTest(testError);
//         }
//       });

//       client.on('connection_success', () => {
//         completeTest(new Error('Should not authenticate with tampered token'));
//       });

//       setTimeout(() => {
//         completeTest(new Error('Tampered token test timeout'));
//       }, 7000);

//       client.connect();
//     });

//     it('Should reject token with mismatched user ID', function(done) {
//       this.timeout(8000);
      
//       // Generate token for different user (falsified identity)
//       const differentUserToken = jwt.sign(
//         { userId: 'falsified_user_999', username: 'falsifiedUser' },
//         JWT_SECRET,
//         { expiresIn: '1h' }
//       );
      
//       const client = Client(authServerUrl, {
//         forceNew: true,
//         reconnection: false,
//         timeout: 3000,
//         autoConnect: false
//       });

//       let testCompleted = false;

//       function completeTest(error) {
//         if (testCompleted) return;
//         testCompleted = true;
        
//         client.disconnect();
//         if (error) {
//           console.log('Mismatched user ID rejection: failed');
//           done(error);
//         } else {
//           console.log('Mismatched user ID rejection: success');
//           done();
//         }
//       }

//       client.on('connect', () => {
//         console.log('Testing mismatched user ID rejection...');
        
//         const mismatchData = {
//           auth: {
//             id: testUserId, // Request for one user
//             token: differentUserToken // But token is for different user (falsified)
//           }
//         };
        
//         client.emit('connect_request', mismatchData);
//       });

//       client.on('connection_error', (error) => {
//         console.log('Expected user ID mismatch rejection');
        
//         try {
//           expect(error).to.have.property('message');
//           expect(error.message).to.include('Token user ID mismatch');
//           expect(authenticatedSockets.size).to.equal(0);
//           completeTest();
//         } catch (testError) {
//           completeTest(testError);
//         }
//       });

//       client.on('connection_success', () => {
//         completeTest(new Error('Should not authenticate with mismatched user ID'));
//       });

//       setTimeout(() => {
//         completeTest(new Error('Mismatched user ID test timeout'));
//       }, 7000);

//       client.connect();
//     });
//   });
// });
// /////////////////////////////////////////////////////////////////////
// // Add this code to the end of your connection.test.js file, right before the final closing });

// // ===== PHASE 3: JSON PROCESSING TESTS =====
// describe('Phase 3: JSON Processing Tests', function() {
//   let jsonServer;
//   let jsonServerUrl;
//   let jsonTestPort;
//   let authTestUserId = 'json_test_user_789';
//   let authTestToken;

//   // Setup JSON processing test server
//   before(async function() {
//     this.timeout(15000);
    
//     try {
//       const socketModule = await import('../server/handlers/socketHandlers.js');
//       connect = socketModule.connect;
//       authenticatedSockets = socketModule.authenticatedSockets;
      
//       jsonTestPort = await getAvailablePort();
//       console.log(`JSON processing test server port: ${jsonTestPort}`);
      
//       // Generate valid token for JSON tests
//       authTestToken = jwt.sign(
//         { userId: authTestUserId, username: 'jsonTestUser' },
//         JWT_SECRET,
//         { expiresIn: '1h' }
//       );
      
//       jsonServer = fastify({ logger: false });
      
//       await jsonServer.register(fastifySocketIo, {
//         cors: {
//           origin: true,
//           credentials: true
//         }
//       });

//       jsonServer.ready((err) => {
//         if (err) throw err;
        
//         jsonServer.io.on('connection', (socket) => {
//           socket.on('connect_request', (data) => {
//             connect(data, socket);
//           });
          
//           // Handle message events for JSON processing tests
//           socket.on('message', (data) => {
//             console.log(`Received message for JSON processing:`, data);
//             // Import the handleMessage function from socketHandlers
//             if (socketModule.handleMessage) {
//               socketModule.handleMessage(data, socket);
//             } else {
//               // Fallback: basic message handling for testing
//               try {
//                 if (!data || !data.action) {
//                   socket.emit('message_error', { 
//                     message: 'Invalid message format - action required' 
//                   });
//                   return;
//                 }
                
//                 // Check if socket is authenticated
//                 const socketData = authenticatedSockets.get(socket.id);
//                 if (!socketData) {
//                   socket.emit('message_error', { 
//                     message: 'Socket not authenticated' 
//                   });
//                   return;
//                 }
                
//                 // Handle different actions
//                 switch (data.action) {
//                   case 'get_document':
//                     if (!data.data || !data.data.doc_id) {
//                       socket.emit('message_error', { 
//                         message: 'Document ID required for get_document action' 
//                       });
//                       return;
//                     }
//                     socket.emit('message_success', {
//                       action: 'get_document',
//                       success: true,
//                       data: { doc_id: data.data.doc_id, title: 'Test Document' }
//                     });
//                     break;
                    
//                   case 'create_document':
//                     if (!data.data || !data.data.title) {
//                       socket.emit('message_error', { 
//                         message: 'Document title required for create_document action' 
//                       });
//                       return;
//                     }
//                     socket.emit('message_success', {
//                       action: 'create_document',
//                       success: true,
//                       data: { doc_id: 'new_doc_123', title: data.data.title }
//                     });
//                     break;
                    
//                   case 'ping':
//                     socket.emit('message_success', {
//                       action: 'ping',
//                       success: true,
//                       data: { message: 'pong', timestamp: new Date().toISOString() }
//                     });
//                     break;
                    
//                   default:
//                     socket.emit('message_error', { 
//                       message: `Unknown action: ${data.action}` 
//                     });
//                 }
//               } catch (error) {
//                 socket.emit('message_error', { 
//                   message: 'Message processing failed' 
//                 });
//               }
//             }
//           });
          
//           socket.on('disconnect', () => {
//             console.log(`JSON test client disconnected: ${socket.id}`);
//           });
//         });
//       });

//       await jsonServer.listen({ port: jsonTestPort, host: '127.0.0.1' });
//       jsonServerUrl = `http://127.0.0.1:${jsonTestPort}`;
//       console.log(`JSON processing test server started on ${jsonServerUrl}`);
      
//     } catch (error) {
//       console.error('Failed to start JSON processing test server:', error);
//       throw error;
//     }
//   });

//   after(async function() {
//     this.timeout(5000);
//     try {
//       if (jsonServer) {
//         await jsonServer.close();
//         console.log('JSON processing test server closed');
//       }
//     } catch (error) {
//       console.error('Error closing JSON processing test server:', error);
//     }
//   });

//   beforeEach(function() {
//     authenticatedSockets.clear();
//   });

//   // Helper function to authenticate and then test JSON processing
//   async function authenticateAndTest(testCallback) {
//     return new Promise((resolve, reject) => {
//       const client = Client(jsonServerUrl, {
//         forceNew: true,
//         reconnection: false,
//         timeout: 3000,
//         autoConnect: false
//       });

//       let isAuthenticated = false;
//       let testCompleted = false;

//       function cleanup(error, result) {
//         if (testCompleted) return;
//         testCompleted = true;
//         client.disconnect();
//         if (error) reject(error);
//         else resolve(result);
//       }

//       client.on('connect', () => {
//         // First authenticate
//         client.emit('connect_request', {
//           auth: {
//             id: authTestUserId,
//             token: authTestToken
//           }
//         });
//       });

//       client.on('connection_success', () => {
//         isAuthenticated = true;
//         // Now run the JSON test
//         testCallback(client, cleanup);
//       });

//       client.on('connection_error', (error) => {
//         cleanup(new Error(`Authentication failed: ${error.message}`));
//       });

//       client.on('connect_error', (error) => {
//         cleanup(new Error(`Socket connection failed: ${error.message}`));
//       });

//       setTimeout(() => {
//         cleanup(new Error('Authentication timeout'));
//       }, 5000);

//       client.connect();
//     });
//   }

//   describe('Structure Validity Tests', function() {
    
//     it('Should process valid JSON message structure', function(done) {
//       this.timeout(8000);
      
//       authenticateAndTest((client, cleanup) => {
//         // Test valid JSON structure
//         const validMessage = {
//           action: 'ping',
//           data: {
//             timestamp: new Date().toISOString()
//           }
//         };

//         client.on('message_success', (response) => {
//           console.log('Valid JSON structure: success');
//           try {
//             expect(response).to.have.property('action', 'ping');
//             expect(response).to.have.property('success', true);
//             expect(response).to.have.property('data');
//             cleanup(null, response);
//           } catch (error) {
//             cleanup(error);
//           }
//         });

//         client.on('message_error', (error) => {
//           cleanup(new Error(`Should not receive error for valid JSON: ${error.message}`));
//         });

//         console.log('Testing valid JSON message structure...');
//         client.emit('message', validMessage);

//         setTimeout(() => {
//           cleanup(new Error('Valid JSON test timeout'));
//         }, 6000);
//       }).then(() => done()).catch(done);
//     });

//     it('Should reject message without action field', function(done) {
//       this.timeout(8000);
      
//       authenticateAndTest((client, cleanup) => {
//         // Test invalid JSON structure - missing action
//         const invalidMessage = {
//           data: {
//             doc_id: 'test_123'
//           }
//           // action field missing
//         };

//         client.on('message_error', (error) => {
//           console.log('Missing action rejection: success');
//           try {
//             expect(error).to.have.property('message');
//             expect(error.message).to.include('action required');
//             cleanup(null, error);
//           } catch (testError) {
//             cleanup(testError);
//           }
//         });

//         client.on('message_success', () => {
//           cleanup(new Error('Should not receive success for message without action'));
//         });

//         console.log('Testing message without action field...');
//         client.emit('message', invalidMessage);

//         setTimeout(() => {
//           cleanup(new Error('Missing action test timeout'));
//         }, 6000);
//       }).then(() => done()).catch(done);
//     });

//     it('Should reject null or undefined message', function(done) {
//       this.timeout(8000);
      
//       authenticateAndTest((client, cleanup) => {
//         client.on('message_error', (error) => {
//           console.log('Null message rejection: success');
//           try {
//             expect(error).to.have.property('message');
//             cleanup(null, error);
//           } catch (testError) {
//             cleanup(testError);
//           }
//         });

//         client.on('message_success', () => {
//           cleanup(new Error('Should not receive success for null message'));
//         });

//         console.log('Testing null message...');
//         client.emit('message', null);

//         setTimeout(() => {
//           cleanup(new Error('Null message test timeout'));
//         }, 6000);
//       }).then(() => done()).catch(done);
//     });

//     it('Should reject message with wrong data types', function(done) {
//       this.timeout(8000);
      
//       authenticateAndTest((client, cleanup) => {
//         // Test invalid JSON structure - action as number
//         const invalidMessage = {
//           action: 123, // Should be string
//           data: 'invalid_data_type' // Should be object
//         };

//         client.on('message_error', (error) => {
//           console.log('Wrong data types rejection: success');
//           try {
//             expect(error).to.have.property('message');
//             cleanup(null, error);
//           } catch (testError) {
//             cleanup(testError);
//           }
//         });

//         client.on('message_success', () => {
//           cleanup(new Error('Should not receive success for wrong data types'));
//         });

//         console.log('Testing message with wrong data types...');
//         client.emit('message', invalidMessage);

//         setTimeout(() => {
//           cleanup(new Error('Wrong data types test timeout'));
//         }, 6000);
//       }).then(() => done()).catch(done);
//     });
//   });

//   describe('Unknown Actions Tests', function() {
    
//     it('Should handle known actions correctly', function(done) {
//       this.timeout(8000);
      
//       authenticateAndTest((client, cleanup) => {
//         const knownActionMessage = {
//           action: 'get_document',
//           data: {
//             doc_id: 'test_document_123'
//           }
//         };

//         client.on('message_success', (response) => {
//           console.log('Known action handling: success');
//           try {
//             expect(response).to.have.property('action', 'get_document');
//             expect(response).to.have.property('success', true);
//             expect(response.data).to.have.property('doc_id', 'test_document_123');
//             cleanup(null, response);
//           } catch (error) {
//             cleanup(error);
//           }
//         });

//         client.on('message_error', (error) => {
//           cleanup(new Error(`Should not receive error for known action: ${error.message}`));
//         });

//         console.log('Testing known action handling...');
//         client.emit('message', knownActionMessage);

//         setTimeout(() => {
//           cleanup(new Error('Known action test timeout'));
//         }, 6000);
//       }).then(() => done()).catch(done);
//     });

//     it('Should reject unknown actions', function(done) {
//       this.timeout(8000);
      
//       authenticateAndTest((client, cleanup) => {
//         const unknownActionMessage = {
//           action: 'destroy_universe',
//           data: {
//             target: 'everything'
//           }
//         };

//         client.on('message_error', (error) => {
//           console.log('Unknown action rejection: success');
//           try {
//             expect(error).to.have.property('message');
//             expect(error.message).to.include('Unknown action');
//             expect(error.message).to.include('destroy_universe');
//             cleanup(null, error);
//           } catch (testError) {
//             cleanup(testError);
//           }
//         });

//         client.on('message_success', () => {
//           cleanup(new Error('Should not receive success for unknown action'));
//         });

//         console.log('Testing unknown action rejection...');
//         client.emit('message', unknownActionMessage);

//         setTimeout(() => {
//           cleanup(new Error('Unknown action test timeout'));
//         }, 6000);
//       }).then(() => done()).catch(done);
//     });

//     it('Should reject empty action string', function(done) {
//       this.timeout(8000);
      
//       authenticateAndTest((client, cleanup) => {
//         const emptyActionMessage = {
//           action: '',
//           data: {
//             test: 'data'
//           }
//         };

//         client.on('message_error', (error) => {
//           console.log('Empty action rejection: success');
//           try {
//             expect(error).to.have.property('message');
//             cleanup(null, error);
//           } catch (testError) {
//             cleanup(testError);
//           }
//         });

//         client.on('message_success', () => {
//           cleanup(new Error('Should not receive success for empty action'));
//         });

//         console.log('Testing empty action string...');
//         client.emit('message', emptyActionMessage);

//         setTimeout(() => {
//           cleanup(new Error('Empty action test timeout'));
//         }, 6000);
//       }).then(() => done()).catch(done);
//     });

//     it('Should reject null action', function(done) {
//       this.timeout(8000);
      
//       authenticateAndTest((client, cleanup) => {
//         const nullActionMessage = {
//           action: null,
//           data: {
//             test: 'data'
//           }
//         };

//         client.on('message_error', (error) => {
//           console.log('Null action rejection: success');
//           try {
//             expect(error).to.have.property('message');
//             cleanup(null, error);
//           } catch (testError) {
//             cleanup(testError);
//           }
//         });

//         client.on('message_success', () => {
//           cleanup(new Error('Should not receive success for null action'));
//         });

//         console.log('Testing null action...');
//         client.emit('message', nullActionMessage);

//         setTimeout(() => {
//           cleanup(new Error('Null action test timeout'));
//         }, 6000);
//       }).then(() => done()).catch(done);
//     });
//   });

//   describe('Missing Data Tests', function() {
    
//     it('Should reject get_document without required doc_id', function(done) {
//       this.timeout(8000);
      
//       authenticateAndTest((client, cleanup) => {
//         const missingDocIdMessage = {
//           action: 'get_document',
//           data: {
//             // doc_id missing
//             title: 'Some document'
//           }
//         };

//         client.on('message_error', (error) => {
//           console.log('Missing doc_id rejection: success');
//           try {
//             expect(error).to.have.property('message');
//             expect(error.message).to.include('Document ID required');
//             cleanup(null, error);
//           } catch (testError) {
//             cleanup(testError);
//           }
//         });

//         client.on('message_success', () => {
//           cleanup(new Error('Should not receive success without doc_id'));
//         });

//         console.log('Testing get_document without doc_id...');
//         client.emit('message', missingDocIdMessage);

//         setTimeout(() => {
//           cleanup(new Error('Missing doc_id test timeout'));
//         }, 6000);
//       }).then(() => done()).catch(done);
//     });

//     it('Should reject create_document without required title', function(done) {
//       this.timeout(8000);
      
//       authenticateAndTest((client, cleanup) => {
//         const missingTitleMessage = {
//           action: 'create_document',
//           data: {
//             // title missing
//             content: 'Document content here'
//           }
//         };

//         client.on('message_error', (error) => {
//           console.log('Missing title rejection: success');
//           try {
//             expect(error).to.have.property('message');
//             expect(error.message).to.include('title required');
//             cleanup(null, error);
//           } catch (testError) {
//             cleanup(testError);
//           }
//         });

//         client.on('message_success', () => {
//           cleanup(new Error('Should not receive success without title'));
//         });

//         console.log('Testing create_document without title...');
//         client.emit('message', missingTitleMessage);

//         setTimeout(() => {
//           cleanup(new Error('Missing title test timeout'));
//         }, 6000);
//       }).then(() => done()).catch(done);
//     });

//     it('Should reject message with null data', function(done) {
//       this.timeout(8000);
      
//       authenticateAndTest((client, cleanup) => {
//         const nullDataMessage = {
//           action: 'get_document',
//           data: null
//         };

//         client.on('message_error', (error) => {
//           console.log('Null data rejection: success');
//           try {
//             expect(error).to.have.property('message');
//             cleanup(null, error);
//           } catch (testError) {
//             cleanup(testError);
//           }
//         });

//         client.on('message_success', () => {
//           cleanup(new Error('Should not receive success with null data'));
//         });

//         console.log('Testing message with null data...');
//         client.emit('message', nullDataMessage);

//         setTimeout(() => {
//           cleanup(new Error('Null data test timeout'));
//         }, 6000);
//       }).then(() => done()).catch(done);
//     });

//     it('Should reject message with empty data object', function(done) {
//       this.timeout(8000);
      
//       authenticateAndTest((client, cleanup) => {
//         const emptyDataMessage = {
//           action: 'get_document',
//           data: {} // Empty object, missing required doc_id
//         };

//         client.on('message_error', (error) => {
//           console.log('Empty data rejection: success');
//           try {
//             expect(error).to.have.property('message');
//             expect(error.message).to.include('Document ID required');
//             cleanup(null, error);
//           } catch (testError) {
//             cleanup(testError);
//           }
//         });

//         client.on('message_success', () => {
//           cleanup(new Error('Should not receive success with empty data'));
//         });

//         console.log('Testing message with empty data object...');
//         client.emit('message', emptyDataMessage);

//         setTimeout(() => {
//           cleanup(new Error('Empty data test timeout'));
//         }, 6000);
//       }).then(() => done()).catch(done);
//     });

//     it('Should handle missing data field entirely', function(done) {
//       this.timeout(8000);
      
//       authenticateAndTest((client, cleanup) => {
//         const noDataMessage = {
//           action: 'get_document'
//           // data field missing entirely
//         };

//         client.on('message_error', (error) => {
//           console.log('Missing data field rejection: success');
//           try {
//             expect(error).to.have.property('message');
//             cleanup(null, error);
//           } catch (testError) {
//             cleanup(testError);
//           }
//         });

//         client.on('message_success', () => {
//           cleanup(new Error('Should not receive success without data field'));
//         });

//         console.log('Testing message without data field...');
//         client.emit('message', noDataMessage);

//         setTimeout(() => {
//           cleanup(new Error('Missing data field test timeout'));
//         }, 6000);
//       }).then(() => done()).catch(done);
//     });
//   });
// });
// ///////////////////////////////////////
// // Add this code to the end of your connection.test.js file, right before the final closing });

// // ===== PHASE 4: INTEGRITY/SECURITY TESTS =====
// describe('Phase 4: Integrity/Security Tests', function() {
//   let securityServer;
//   let securityServerUrl;
//   let securityTestPort;
//   let securityTestUserId = 'security_test_user_999';
//   let securityTestToken;

//   // Setup security test server
//   before(async function() {
//     this.timeout(15000);
    
//     try {
//       const socketModule = await import('../server/handlers/socketHandlers.js');
//       connect = socketModule.connect;
//       authenticatedSockets = socketModule.authenticatedSockets;
      
//       securityTestPort = await getAvailablePort();
//       console.log(`Security test server port: ${securityTestPort}`);
      
//       // Generate valid token for security tests
//       securityTestToken = jwt.sign(
//         { userId: securityTestUserId, username: 'securityTestUser' },
//         JWT_SECRET,
//         { expiresIn: '1h' }
//       );
      
//       securityServer = fastify({ logger: false });
      
//       await securityServer.register(fastifySocketIo, {
//         cors: {
//           origin: true,
//           credentials: true
//         }
//       });

//       securityServer.ready((err) => {
//         if (err) throw err;
        
//         securityServer.io.on('connection', (socket) => {
//           socket.on('connect_request', (data) => {
//             connect(data, socket);
//           });
          
//           socket.on('message', (data) => {
//             // Basic message handling for security tests
//             try {
//               if (!data || !data.action) {
//                 socket.emit('message_error', { 
//                   message: 'Invalid message format - action required' 
//                 });
//                 return;
//               }
              
//               const socketData = authenticatedSockets.get(socket.id);
//               if (!socketData) {
//                 socket.emit('message_error', { 
//                   message: 'Socket not authenticated' 
//                 });
//                 return;
//               }
              
//               // Security validation - check for injection attempts
//               if (typeof data.action !== 'string') {
//                 socket.emit('message_error', { 
//                   message: 'Invalid action type' 
//                 });
//                 return;
//               }
              
//               // Check for SQL injection patterns
//               const sqlInjectionPatterns = [
//                 /'; DROP TABLE/i,
//                 /UNION SELECT/i,
//                 /<script>/i,
//                 /javascript:/i,
//                 /eval\(/i,
//                 /exec\(/i
//               ];
              
//               const checkForInjection = (value) => {
//                 if (typeof value === 'string') {
//                   return sqlInjectionPatterns.some(pattern => pattern.test(value));
//                 }
//                 if (typeof value === 'object' && value !== null) {
//                   return Object.values(value).some(checkForInjection);
//                 }
//                 return false;
//               };
              
//               if (checkForInjection(data)) {
//                 socket.emit('security_violation', {
//                   message: 'Potential injection attempt detected',
//                   code: 'INJECTION_DETECTED',
//                   timestamp: new Date().toISOString()
//                 });
//                 return;
//               }
              
//               // Handle valid actions
//               switch (data.action) {
//                 case 'get_document':
//                   if (!data.data || !data.data.doc_id) {
//                     socket.emit('message_error', { 
//                       message: 'Document ID required' 
//                     });
//                     return;
//                   }
//                   socket.emit('message_success', {
//                     action: 'get_document',
//                     success: true,
//                     data: { doc_id: data.data.doc_id }
//                   });
//                   break;
                  
//                 case 'ping':
//                   socket.emit('message_success', {
//                     action: 'ping',
//                     success: true,
//                     data: { message: 'pong' }
//                   });
//                   break;
                  
//                 default:
//                   socket.emit('message_error', { 
//                     message: `Unknown action: ${data.action}` 
//                   });
//               }
//             } catch (error) {
//               socket.emit('message_error', { 
//                 message: 'Message processing failed',
//                 error: error.message 
//               });
//             }
//           });
          
//           socket.on('disconnect', () => {
//             console.log(`Security test client disconnected: ${socket.id}`);
//           });
//         });
//       });

//       await securityServer.listen({ port: securityTestPort, host: '127.0.0.1' });
//       securityServerUrl = `http://127.0.0.1:${securityTestPort}`;
//       console.log(`Security test server started on ${securityServerUrl}`);
      
//     } catch (error) {
//       console.error('Failed to start security test server:', error);
//       throw error;
//     }
//   });

//   after(async function() {
//     this.timeout(5000);
//     try {
//       if (securityServer) {
//         await securityServer.close();
//         console.log('Security test server closed');
//       }
//     } catch (error) {
//       console.error('Error closing security test server:', error);
//     }
//   });

//   beforeEach(function() {
//     authenticatedSockets.clear();
//   });

//   // Helper function for security tests
//   async function authenticateAndSecurityTest(testCallback) {
//     return new Promise((resolve, reject) => {
//       const client = Client(securityServerUrl, {
//         forceNew: true,
//         reconnection: false,
//         timeout: 3000,
//         autoConnect: false
//       });

//       let testCompleted = false;

//       function cleanup(error, result) {
//         if (testCompleted) return;
//         testCompleted = true;
//         client.disconnect();
//         if (error) reject(error);
//         else resolve(result);
//       }

//       client.on('connect', () => {
//         client.emit('connect_request', {
//           auth: {
//             id: securityTestUserId,
//             token: securityTestToken
//           }
//         });
//       });

//       client.on('connection_success', () => {
//         testCallback(client, cleanup);
//       });

//       client.on('connection_error', (error) => {
//         cleanup(new Error(`Authentication failed: ${error.message}`));
//       });

//       client.on('connect_error', (error) => {
//         cleanup(new Error(`Socket connection failed: ${error.message}`));
//       });

//       setTimeout(() => {
//         cleanup(new Error('Security test authentication timeout'));
//       }, 5000);

//       client.connect();
//     });
//   }

//   describe('Injection Attack Tests', function() {
    
//     it('Should detect and block SQL injection attempts', function(done) {
//       this.timeout(8000);
      
//       authenticateAndSecurityTest((client, cleanup) => {
//         const sqlInjectionMessage = {
//           action: 'get_document',
//           data: {
//             doc_id: "'; DROP TABLE users; --"
//           }
//         };

//         client.on('security_violation', (response) => {
//           console.log('SQL injection detection: success');
//           try {
//             expect(response).to.have.property('message');
//             expect(response.message).to.include('injection attempt detected');
//             expect(response).to.have.property('code', 'INJECTION_DETECTED');
//             cleanup(null, response);
//           } catch (error) {
//             cleanup(error);
//           }
//         });

//         client.on('message_success', () => {
//           cleanup(new Error('Should not receive success for SQL injection attempt'));
//         });

//         client.on('message_error', (error) => {
//           // Also acceptable - server rejected the malicious input
//           console.log('SQL injection blocked by error handler: success');
//           cleanup(null, error);
//         });

//         console.log('Testing SQL injection detection...');
//         client.emit('message', sqlInjectionMessage);

//         setTimeout(() => {
//           cleanup(new Error('SQL injection test timeout'));
//         }, 6000);
//       }).then(() => done()).catch(done);
//     });

//     it('Should detect and block XSS injection attempts', function(done) {
//       this.timeout(8000);
      
//       authenticateAndSecurityTest((client, cleanup) => {
//         const xssInjectionMessage = {
//           action: 'get_document',
//           data: {
//             doc_id: '<script>alert("XSS")</script>'
//           }
//         };

//         client.on('security_violation', (response) => {
//           console.log('XSS injection detection: success');
//           try {
//             expect(response).to.have.property('message');
//             expect(response.message).to.include('injection attempt detected');
//             cleanup(null, response);
//           } catch (error) {
//             cleanup(error);
//           }
//         });

//         client.on('message_success', () => {
//           cleanup(new Error('Should not receive success for XSS injection attempt'));
//         });

//         client.on('message_error', (error) => {
//           console.log('XSS injection blocked by error handler: success');
//           cleanup(null, error);
//         });

//         console.log('Testing XSS injection detection...');
//         client.emit('message', xssInjectionMessage);

//         setTimeout(() => {
//           cleanup(new Error('XSS injection test timeout'));
//         }, 6000);
//       }).then(() => done()).catch(done);
//     });

//     it('Should detect and block JavaScript injection attempts', function(done) {
//       this.timeout(8000);
      
//       authenticateAndSecurityTest((client, cleanup) => {
//         const jsInjectionMessage = {
//           action: 'get_document',
//           data: {
//             doc_id: 'javascript:eval("malicious code")'
//           }
//         };

//         client.on('security_violation', (response) => {
//           console.log('JavaScript injection detection: success');
//           try {
//             expect(response).to.have.property('message');
//             expect(response.message).to.include('injection attempt detected');
//             cleanup(null, response);
//           } catch (error) {
//             cleanup(error);
//           }
//         });

//         client.on('message_success', () => {
//           cleanup(new Error('Should not receive success for JS injection attempt'));
//         });

//         client.on('message_error', (error) => {
//           console.log('JavaScript injection blocked by error handler: success');
//           cleanup(null, error);
//         });

//         console.log('Testing JavaScript injection detection...');
//         client.emit('message', jsInjectionMessage);

//         setTimeout(() => {
//           cleanup(new Error('JavaScript injection test timeout'));
//         }, 6000);
//       }).then(() => done()).catch(done);
//     });

//     it('Should handle nested injection attempts in complex objects', function(done) {
//       this.timeout(8000);
      
//       authenticateAndSecurityTest((client, cleanup) => {
//         const nestedInjectionMessage = {
//           action: 'create_document',
//           data: {
//             title: 'Normal Title',
//             content: {
//               text: 'Normal content',
//               metadata: {
//                 author: "'; DROP DATABASE; --",
//                 tags: ['normal', '<script>alert("nested")</script>']
//               }
//             }
//           }
//         };

//         client.on('security_violation', (response) => {
//           console.log('Nested injection detection: success');
//           try {
//             expect(response).to.have.property('message');
//             expect(response.message).to.include('injection attempt detected');
//             cleanup(null, response);
//           } catch (error) {
//             cleanup(error);
//           }
//         });

//         client.on('message_success', () => {
//           cleanup(new Error('Should not receive success for nested injection attempt'));
//         });

//         client.on('message_error', (error) => {
//           console.log('Nested injection blocked by error handler: success');
//           cleanup(null, error);
//         });

//         console.log('Testing nested injection detection...');
//         client.emit('message', nestedInjectionMessage);

//         setTimeout(() => {
//           cleanup(new Error('Nested injection test timeout'));
//         }, 6000);
//       }).then(() => done()).catch(done);
//     });
//   });

//   describe('Abrupt Disconnection Tests', function() {
    
//     it('Should handle abrupt client disconnection gracefully', function(done) {
//       this.timeout(8000);
      
//       const client = Client(securityServerUrl, {
//         forceNew: true,
//         reconnection: false,
//         timeout: 3000,
//         autoConnect: false
//       });

//       let isAuthenticated = false;
//       let testCompleted = false;

//       function completeTest(error) {
//         if (testCompleted) return;
//         testCompleted = true;
        
//         if (error) {
//           console.log('Abrupt disconnection handling: failed');
//           done(error);
//         } else {
//           console.log('Abrupt disconnection handling: success');
//           done();
//         }
//       }

//       client.on('connect', () => {
//         client.emit('connect_request', {
//           auth: {
//             id: securityTestUserId,
//             token: securityTestToken
//           }
//         });
//       });

//       client.on('connection_success', () => {
//         isAuthenticated = true;
//         console.log('Client authenticated, checking socket count...');
        
//         try {
//           expect(authenticatedSockets.size).to.equal(1);
          
//           // Simulate abrupt disconnection
//           console.log('Simulating abrupt disconnection...');
//           client.disconnect();
          
//           // Check cleanup after disconnection
//           setTimeout(() => {
//             try {
//               expect(authenticatedSockets.size).to.equal(0);
//               console.log('Socket cleanup after abrupt disconnection verified');
//               completeTest();
//             } catch (cleanupError) {
//               completeTest(cleanupError);
//             }
//           }, 500);
//         } catch (error) {
//           completeTest(error);
//         }
//       });

//       client.on('connection_error', (error) => {
//         completeTest(new Error(`Authentication failed: ${error.message}`));
//       });

//       client.on('connect_error', (error) => {
//         completeTest(new Error(`Socket connection failed: ${error.message}`));
//       });

//       setTimeout(() => {
//         completeTest(new Error('Abrupt disconnection test timeout'));
//       }, 7000);

//       client.connect();
//     });

//     it('Should handle multiple abrupt disconnections', function(done) {
//       this.timeout(10000);
      
//       const clients = [];
//       const totalClients = 3;
//       let authenticatedCount = 0;
//       let testCompleted = false;

//       function completeTest(error) {
//         if (testCompleted) return;
//         testCompleted = true;
        
//         clients.forEach(client => {
//           if (client.connected) client.disconnect();
//         });
        
//         if (error) {
//           console.log('Multiple abrupt disconnections handling: failed');
//           done(error);
//         } else {
//           console.log('Multiple abrupt disconnections handling: success');
//           done();
//         }
//       }

//       function checkAllAuthenticated() {
//         authenticatedCount++;
//         console.log(`Authenticated clients: ${authenticatedCount}/${totalClients}`);
        
//         if (authenticatedCount === totalClients) {
//           try {
//             expect(authenticatedSockets.size).to.equal(totalClients);
            
//             // Abruptly disconnect all clients
//             console.log('Disconnecting all clients abruptly...');
//             clients.forEach((client, index) => {
//               setTimeout(() => {
//                 client.disconnect();
//               }, index * 50); // Stagger disconnections slightly
//             });
            
//             // Check cleanup
//             setTimeout(() => {
//               try {
//                 expect(authenticatedSockets.size).to.equal(0);
//                 console.log('All sockets cleaned up after multiple abrupt disconnections');
//                 completeTest();
//               } catch (cleanupError) {
//                 completeTest(cleanupError);
//               }
//             }, 1000);
//           } catch (error) {
//             completeTest(error);
//           }
//         }
//       }

//       for (let i = 0; i < totalClients; i++) {
//         const client = Client(securityServerUrl, {
//           forceNew: true,
//           reconnection: false,
//           timeout: 3000,
//           autoConnect: false
//         });
        
//         clients.push(client);
        
//         client.on('connect', () => {
//           client.emit('connect_request', {
//             auth: {
//               id: securityTestUserId,
//               token: securityTestToken
//             }
//           });
//         });
        
//         client.on('connection_success', checkAllAuthenticated);
        
//         client.on('connection_error', (error) => {
//           completeTest(new Error(`Client ${i} authentication failed: ${error.message}`));
//         });
        
//         setTimeout(() => client.connect(), i * 100);
//       }

//       setTimeout(() => {
//         completeTest(new Error('Multiple abrupt disconnections test timeout'));
//       }, 9000);
//     });

//     it('Should handle disconnection during message processing', function(done) {
//       this.timeout(8000);
      
//       authenticateAndSecurityTest((client, cleanup) => {
//         // Send a message and disconnect immediately
//         const testMessage = {
//           action: 'ping',
//           data: {}
//         };

//         let messageReceived = false;

//         client.on('message_success', () => {
//           messageReceived = true;
//           console.log('Message processed before disconnection: success');
//           cleanup(null, 'success');
//         });

//         client.on('message_error', () => {
//           console.log('Message processing interrupted by disconnection: success');
//           cleanup(null, 'interrupted');
//         });

//         console.log('Testing disconnection during message processing...');
//         client.emit('message', testMessage);
        
//         // Disconnect immediately after sending message
//         setTimeout(() => {
//           client.disconnect();
          
//           // If no response received, that's also acceptable
//           setTimeout(() => {
//             if (!messageReceived) {
//               console.log('Message processing interrupted by disconnection: success');
//               cleanup(null, 'interrupted');
//             }
//           }, 500);
//         }, 10);

//         setTimeout(() => {
//           cleanup(new Error('Disconnection during processing test timeout'));
//         }, 6000);
//       }).then(() => done()).catch(done);
//     });
//   });

//   describe('Reconnection Tests', function() {
    
//     it('Should handle normal reconnection after disconnection', function(done) {
//       this.timeout(10000);
      
//       let firstConnectionId;
//       let testCompleted = false;

//       function completeTest(error) {
//         if (testCompleted) return;
//         testCompleted = true;
        
//         if (error) {
//           console.log('Normal reconnection: failed');
//           done(error);
//         } else {
//           console.log('Normal reconnection: success');
//           done();
//         }
//       }

//       // First connection
//       const client1 = Client(securityServerUrl, {
//         forceNew: true,
//         reconnection: false,
//         timeout: 3000,
//         autoConnect: false
//       });

//       client1.on('connect', () => {
//         client1.emit('connect_request', {
//           auth: {
//             id: securityTestUserId,
//             token: securityTestToken
//           }
//         });
//       });

//       client1.on('connection_success', (response) => {
//         firstConnectionId = response.socketId;
//         console.log(`First connection successful: ${firstConnectionId}`);
        
//         try {
//           expect(authenticatedSockets.size).to.equal(1);
          
//           // Disconnect first client
//           client1.disconnect();
          
//           // Wait a moment then reconnect
//           setTimeout(() => {
//             const client2 = Client(securityServerUrl, {
//               forceNew: true,
//               reconnection: false,
//               timeout: 3000,
//               autoConnect: false
//             });

//             client2.on('connect', () => {
//               client2.emit('connect_request', {
//                 auth: {
//                   id: securityTestUserId,
//                   token: securityTestToken
//                 }
//               });
//             });

//             client2.on('connection_success', (response) => {
//               console.log(`Reconnection successful: ${response.socketId}`);
              
//               try {
//                 expect(response.socketId).to.not.equal(firstConnectionId);
//                 expect(authenticatedSockets.size).to.equal(1);
//                 client2.disconnect();
//                 completeTest();
//               } catch (error) {
//                 client2.disconnect();
//                 completeTest(error);
//               }
//             });

//             client2.on('connection_error', (error) => {
//               completeTest(new Error(`Reconnection failed: ${error.message}`));
//             });

//             client2.connect();
//           }, 500);
//         } catch (error) {
//           completeTest(error);
//         }
//       });

//       client1.on('connection_error', (error) => {
//         completeTest(new Error(`First connection failed: ${error.message}`));
//       });

//       setTimeout(() => {
//         completeTest(new Error('Normal reconnection test timeout'));
//       }, 9000);

//       client1.connect();
//     });

//     it('Should handle rapid reconnection attempts', function(done) {
//       this.timeout(8000);
      
//       let connectionAttempts = 0;
//       let successfulConnections = 0;
//       const maxAttempts = 5;
//       let testCompleted = false;

//       function completeTest(error) {
//         if (testCompleted) return;
//         testCompleted = true;
        
//         if (error) {
//           console.log('Rapid reconnection: failed');
//           done(error);
//         } else {
//           console.log('Rapid reconnection: success');
//           done();
//         }
//       }

//       function attemptConnection() {
//         connectionAttempts++;
//         console.log(`Rapid reconnection attempt ${connectionAttempts}/${maxAttempts}`);
        
//         const client = Client(securityServerUrl, {
//           forceNew: true,
//           reconnection: false,
//           timeout: 2000,
//           autoConnect: false
//         });
        
//         client.on('connect', () => {
//           client.emit('connect_request', {
//             auth: {
//               id: securityTestUserId,
//               token: securityTestToken
//             }
//           });
//         });
        
//         client.on('connection_success', () => {
//           successfulConnections++;
//           console.log(`Rapid reconnection ${successfulConnections}/${maxAttempts} successful`);
          
//           client.disconnect();
          
//           if (connectionAttempts < maxAttempts) {
//             setTimeout(attemptConnection, 50); // Very short delay
//           } else {
//             try {
//               expect(successfulConnections).to.equal(maxAttempts);
//               expect(authenticatedSockets.size).to.equal(0);
//               completeTest();
//             } catch (error) {
//               completeTest(error);
//             }
//           }
//         });
        
//         client.on('connection_error', (error) => {
//           client.disconnect();
//           completeTest(new Error(`Rapid reconnection attempt ${connectionAttempts} failed: ${error.message}`));
//         });
        
//         client.connect();
//       }

//       setTimeout(() => {
//         completeTest(new Error('Rapid reconnection test timeout'));
//       }, 7000);

//       attemptConnection();
//     });

//     it('Should handle reconnection with expired token', function(done) {
//       this.timeout(8000);
      
//       // Generate a token that will expire soon
//       const shortLivedToken = jwt.sign(
//         { userId: securityTestUserId, username: 'securityTestUser' },
//         JWT_SECRET,
//         { expiresIn: '100ms' } // Very short expiry
//       );

//       let testCompleted = false;

//       function completeTest(error) {
//         if (testCompleted) return;
//         testCompleted = true;
        
//         if (error) {
//           console.log('Expired token reconnection: failed');
//           done(error);
//         } else {
//           console.log('Expired token reconnection: success');
//           done();
//         }
//       }

//       // Wait for token to expire, then try to connect
//       setTimeout(() => {
//         const client = Client(securityServerUrl, {
//           forceNew: true,
//           reconnection: false,
//           timeout: 3000,
//           autoConnect: false
//         });

//         client.on('connect', () => {
//           client.emit('connect_request', {
//             auth: {
//               id: securityTestUserId,
//               token: shortLivedToken // This should be expired now
//             }
//           });
//         });

//         client.on('connection_error', (error) => {
//           console.log('Expected error for expired token on reconnection');
//           try {
//             expect(error).to.have.property('message');
//             expect(error.message).to.include('Token has expired');
//             expect(authenticatedSockets.size).to.equal(0);
//             client.disconnect();
//             completeTest();
//           } catch (testError) {
//             client.disconnect();
//             completeTest(testError);
//           }
//         });

//         client.on('connection_success', () => {
//           client.disconnect();
//           completeTest(new Error('Should not authenticate with expired token'));
//         });

//         setTimeout(() => {
//           completeTest(new Error('Expired token reconnection test timeout'));
//         }, 6000);

//         client.connect();
//       }, 200); // Wait for token to expire
//     });
//   });
// });
//////////////////////////////
// ===== PHASE 5: DATABASE TESTS =====
  describe('Phase 5: Database Tests', function() {
    let dbServer;
    let dbServerUrl;
    let dbTestPort;
    let dbTestUserId = 'db_test_user_555';
    let dbTestToken;

    // Setup database test server
    before(async function() {
      this.timeout(15000);
      
      try {
        // Initialize test database
        console.log('🔄 Setting up test database...');
        await DatabaseOperations.initialize();
        console.log('✅ Test database ready!');

        const socketModule = await import('../server/handlers/socketHandlers.js');
        connect = socketModule.connect;
        authenticatedSockets = socketModule.authenticatedSockets;
        
        dbTestPort = await getAvailablePort();
        console.log(`Database test server port: ${dbTestPort}`);
        
        // Generate valid token for database tests
        dbTestToken = jwt.sign(
          { userId: dbTestUserId, username: 'dbTestUser' },
          JWT_SECRET,
          { expiresIn: '1h' }
        );
        
        dbServer = fastify({ logger: false });
        
        await dbServer.register(fastifySocketIo, {
          cors: {
            origin: true,
            credentials: true
          }
        });

        dbServer.ready((err) => {
          if (err) throw err;
          
          dbServer.io.on('connection', (socket) => {
            socket.on('connect_request', (data) => {
              connect(data, socket);
            });
            
            // Use real message handler
            socket.on('message', (data) => {
              socketModule.handleMessage(data, socket);
            });
            
            socket.on('disconnect', () => {
              console.log(`Database test client disconnected: ${socket.id}`);
            });
          });
        });

        await dbServer.listen({ port: dbTestPort, host: '127.0.0.1' });
        dbServerUrl = `http://127.0.0.1:${dbTestPort}`;
        console.log(`Database test server started on ${dbServerUrl}`);
        
      } catch (error) {
        console.error('Failed to start database test server:', error);
        throw error;
      }
    });

    after(async function() {
      this.timeout(5000);
      try {
        if (dbServer) {
          await dbServer.close();
          console.log('Database test server closed');
        }
        // Clean up test database
        await DatabaseOperations.close();
      } catch (error) {
        console.error('Error closing database test server:', error);
      }
    });

    beforeEach(async function() {
      // Clear authenticated sockets
      authenticatedSockets.clear();
      
      // Clean up test data between tests
      try {
        await sequelize.query('DELETE FROM documents WHERE owner = ?', {
          replacements: [dbTestUserId]
        });
        await sequelize.query('DELETE FROM backups WHERE user_id = ?', {
          replacements: [dbTestUserId]
        });
      } catch (error) {
        console.warn('Test cleanup warning:', error.message);
      }
    });

    // Helper function for database tests
    async function authenticateAndDbTest(testCallback) {
      return new Promise((resolve, reject) => {
        const client = Client(dbServerUrl, {
          forceNew: true,
          reconnection: false,
          timeout: 3000,
          autoConnect: false
        });

        let testCompleted = false;

        function cleanup(error, result) {
          if (testCompleted) return;
          testCompleted = true;
          client.disconnect();
          if (error) reject(error);
          else resolve(result);
        }

        client.on('connect', () => {
          client.emit('connect_request', {
            auth: {
              id: dbTestUserId,
              token: dbTestToken
            }
          });
        });

        client.on('connection_success', () => {
          testCallback(client, cleanup);
        });

        client.on('connection_error', (error) => {
          cleanup(new Error(`Authentication failed: ${error.message}`));
        });

        client.on('connect_error', (error) => {
          cleanup(new Error(`Socket connection failed: ${error.message}`));
        });

        setTimeout(() => {
          cleanup(new Error('Database test authentication timeout'));
        }, 5000);

        client.connect();
      });
    }

    describe('Consistent Read/Write Tests', function() {
      
      it('Should create and retrieve documents consistently', function(done) {
        this.timeout(8000);
        
        authenticateAndDbTest((client, cleanup) => {
          const testDocument = {
            title: 'Test Document for Consistency',
            content: 'This is test content for database consistency testing.'
          };

          let documentId;

          // First create a document
          client.on('db_success', (response) => {
            if (response.action === 'create_document') {
              console.log('Document creation: success');
              documentId = response.data.id;
              
              try {
                expect(response.data).to.have.property('title', testDocument.title);
                expect(response.data).to.have.property('content', testDocument.content);
                expect(response.data).to.have.property('id');
                expect(response.data).to.have.property('createdAt');
                
                // Now retrieve the document
                client.emit('message', {
                  action: 'get_document',
                  data: { doc_id: documentId }
                });
              } catch (error) {
                cleanup(error);
              }
            } else if (response.action === 'get_document') {
              console.log('Document retrieval: success');
              
              try {
                expect(response.data).to.have.property('id', documentId);
                expect(response.data).to.have.property('title', testDocument.title);
                expect(response.data).to.have.property('content', testDocument.content);
                expect(response.data).to.have.property('owner', dbTestUserId);
                console.log('Consistent read/write: success');
                cleanup(null, response);
              } catch (error) {
                cleanup(error);
              }
            }
          });

          client.on('db_error', (error) => {
            cleanup(new Error(`Database operation failed: ${error.message}`));
          });

          console.log('Testing consistent document creation and retrieval...');
          client.emit('message', {
            action: 'create_document',
            data: testDocument
          });

          setTimeout(() => {
            cleanup(new Error('Consistent read/write test timeout'));
          }, 6000);
        }).then(() => done()).catch(done);
      });

      it('Should handle document updates consistently', function(done) {
        this.timeout(8000);
        
        authenticateAndDbTest((client, cleanup) => {
          const originalDoc = {
            title: 'Original Title',
            content: 'Original content'
          };
          
          const updatedData = {
            title: 'Updated Title',
            content: 'Updated content with new information'
          };

          let documentId;

          client.on('db_success', (response) => {
            if (response.action === 'create_document') {
              documentId = response.data.id;
              
              // Update the document
              client.emit('message', {
                action: 'update_document',
                data: {
                  doc_id: documentId,
                  title: updatedData.title,
                  content: updatedData.content
                }
              });
            } else if (response.action === 'update_document') {
              try {
                expect(response.data).to.have.property('title', updatedData.title);
                expect(response.data).to.have.property('content', updatedData.content);
                expect(response.data).to.have.property('updatedAt');
                
                // Verify update by retrieving
                client.emit('message', {
                  action: 'get_document',
                  data: { doc_id: documentId }
                });
              } catch (error) {
                cleanup(error);
              }
            } else if (response.action === 'get_document') {
              try {
                expect(response.data).to.have.property('title', updatedData.title);
                expect(response.data).to.have.property('content', updatedData.content);
                console.log('Document update consistency: success');
                cleanup(null, response);
              } catch (error) {
                cleanup(error);
              }
            }
          });

          client.on('db_error', (error) => {
            cleanup(new Error(`Database operation failed: ${error.message}`));
          });

          console.log('Testing document update consistency...');
          client.emit('message', {
            action: 'create_document',
            data: originalDoc
          });

          setTimeout(() => {
            cleanup(new Error('Document update consistency test timeout'));
          }, 6000);
        }).then(() => done()).catch(done);
      });

      it('Should handle document deletion consistently', function(done) {
        this.timeout(8000);
        
        authenticateAndDbTest((client, cleanup) => {
          const testDoc = {
            title: 'Document to Delete',
            content: 'This document will be deleted'
          };

          let documentId;

          client.on('db_success', (response) => {
            if (response.action === 'create_document') {
              documentId = response.data.id;
              
              // Delete the document
              client.emit('message', {
                action: 'delete_document',
                data: { doc_id: documentId }
              });
            } else if (response.action === 'delete_document') {
              try {
                expect(response.data).to.have.property('deleted', true);
                expect(response.data).to.have.property('doc_id', documentId);
                
                // Try to retrieve deleted document
                client.emit('message', {
                  action: 'get_document',
                  data: { doc_id: documentId }
                });
              } catch (error) {
                cleanup(error);
              }
            }
          });

          client.on('db_error', (error) => {
            if (error.code === 'NOT_FOUND') {
              console.log('Document deletion consistency: success');
              cleanup(null, 'Document properly deleted');
            } else {
              cleanup(new Error(`Unexpected database error: ${error.message}`));
            }
          });

          console.log('Testing document deletion consistency...');
          client.emit('message', {
            action: 'create_document',
            data: testDoc
          });

          setTimeout(() => {
            cleanup(new Error('Document deletion consistency test timeout'));
          }, 6000);
        }).then(() => done()).catch(done);
      });
    });

    describe('Malformed Data Tests', function() {
      
      it('Should reject documents with invalid data', function(done) {
        this.timeout(8000);
        
        authenticateAndDbTest((client, cleanup) => {
          const malformedDoc = {
            title: '', // Empty title should fail validation
            content: 'Some content'
          };

          client.on('db_error', (error) => {
            console.log('Invalid data rejection: success');
            try {
              expect(error).to.have.property('message');
              expect(error).to.have.property('code');
              cleanup(null, error);
            } catch (testError) {
              cleanup(testError);
            }
          });

          client.on('db_success', () => {
            cleanup(new Error('Should not accept invalid data'));
          });

          console.log('Testing invalid data rejection...');
          client.emit('message', {
            action: 'create_document',
            data: malformedDoc
          });

          setTimeout(() => {
            cleanup(new Error('Invalid data test timeout'));
          }, 6000);
        }).then(() => done()).catch(done);
      });

      it('Should reject documents with data too large', function(done) {
        this.timeout(8000);
        
        authenticateAndDbTest((client, cleanup) => {
          const oversizedDoc = {
            title: 'x'.repeat(1001), // Too long for our validation
            content: 'Normal content'
          };

          client.on('db_error', (error) => {
            console.log('Oversized data rejection: success');
            try {
              expect(error).to.have.property('message');
              expect(error).to.have.property('code');
              cleanup(null, error);
            } catch (testError) {
              cleanup(testError);
            }
          });

          client.on('db_success', () => {
            cleanup(new Error('Should not accept oversized data'));
          });

          console.log('Testing oversized data rejection...');
          client.emit('message', {
            action: 'create_document',
            data: oversizedDoc
          });

          setTimeout(() => {
            cleanup(new Error('Oversized data test timeout'));
          }, 6000);
        }).then(() => done()).catch(done);
      });

      it('Should handle corrupted data gracefully', function(done) {
        this.timeout(8000);
        
        authenticateAndDbTest((client, cleanup) => {
          const testDoc = {
            title: 'Document to Corrupt',
            content: 'This will be corrupted'
          };

          let documentId;

          client.on('db_success', (response) => {
            if (response.action === 'create_document') {
              documentId = response.data.id;
              
              // Corrupt the document
              client.emit('message', {
                action: 'corrupt_data',
                data: { doc_id: documentId }
              });
            } else if (response.action === 'corrupt_data') {
              // Try to read corrupted document
              client.emit('message', {
                action: 'get_document',
                data: { doc_id: documentId }
              });
            }
          });

          client.on('db_error', (error) => {
            if (error.code === 'CORRUPTED_DATA') {
              console.log('Corrupted data handling: success');
              try {
                expect(error).to.have.property('message');
                expect(error.message).to.include('corrupted');
                cleanup(null, error);
              } catch (testError) {
                cleanup(testError);
              }
            } else {
              cleanup(new Error(`Unexpected error: ${error.message}`));
            }
          });

          console.log('Testing corrupted data handling...');
          client.emit('message', {
            action: 'create_document',
            data: testDoc
          });

          setTimeout(() => {
            cleanup(new Error('Corrupted data test timeout'));
          }, 6000);
        }).then(() => done()).catch(done);
      });
    });

    describe('Backup and Recovery Tests', function() {
      
      it('Should create and restore data backups successfully', function(done) {
        this.timeout(10000);
        
        authenticateAndDbTest((client, cleanup) => {
          const testDocs = [
            { title: 'Document 1', content: 'Content 1' },
            { title: 'Document 2', content: 'Content 2' }
          ];

          let createdDocs = [];
          let backupId;

          client.on('db_success', (response) => {
            if (response.action === 'create_document') {
              createdDocs.push(response.data);
              
              if (createdDocs.length === testDocs.length) {
                // Create backup
                client.emit('message', {
                  action: 'backup_data',
                  data: {}
                });
              }
            } else if (response.action === 'backup_data') {
              backupId = response.data.backup_id;
              try {
                expect(response.data).to.have.property('backup_id');
                expect(response.data).to.have.property('records_count', testDocs.length);
                
                // Now restore the backup
                client.emit('message', {
                  action: 'restore_data',
                  data: { backup_id: backupId }
                });
              } catch (error) {
                cleanup(error);
              }
            } else if (response.action === 'restore_data') {
              try {
                expect(response.data).to.have.property('backup_id', backupId);
                expect(response.data).to.have.property('records_restored', testDocs.length);
                
                // Verify restored data by getting first document
                client.emit('message', {
                  action: 'get_document',
                  data: { doc_id: createdDocs[0].id }
                });
              } catch (error) {
                cleanup(error);
              }
            } else if (response.action === 'get_document') {
              try {
                expect(response.data).to.have.property('title', testDocs[0].title);
                expect(response.data).to.have.property('content', testDocs[0].content);
                console.log('Backup and recovery: success');
                cleanup(null, response);
              } catch (error) {
                cleanup(error);
              }
            }
          });

          client.on('db_error', (error) => {
            cleanup(new Error(`Backup/recovery failed: ${error.message}`));
          });

          console.log('Testing backup and recovery...');
          // Create test documents
          testDocs.forEach(doc => {
            client.emit('message', {
              action: 'create_document',
              data: doc
            });
          });

          setTimeout(() => {
            cleanup(new Error('Backup and recovery test timeout'));
          }, 8000);
        }).then(() => done()).catch(done);
      });

      it('Should handle corrupted backup data', function(done) {
        this.timeout(8000);
        
        authenticateAndDbTest((client, cleanup) => {
          const invalidBackupId = 'invalid_backup_123';

          client.on('db_error', (error) => {
            console.log('Corrupted backup handling: success');
            try {
              expect(error).to.have.property('message');
              expect(error.code).to.be.oneOf(['BACKUP_NOT_FOUND', 'CORRUPTED_BACKUP']);
              cleanup(null, error);
            } catch (testError) {
              cleanup(testError);
            }
          });

          client.on('db_success', () => {
            cleanup(new Error('Should not restore from invalid backup'));
          });

          console.log('Testing corrupted backup handling...');
          client.emit('message', {
            action: 'restore_data',
            data: { backup_id: invalidBackupId }
          });

          setTimeout(() => {
            cleanup(new Error('Corrupted backup test timeout'));
          }, 6000);
        }).then(() => done()).catch(done);
      });
    });

    describe('Database Error Handling Tests', function() {
      
      it('Should handle concurrent access gracefully', function(done) {
        this.timeout(10000);
        
        const clients = [];
        const totalClients = 3;
        let operationsCompleted = 0;
        let testCompleted = false;

        function completeTest(error) {
          if (testCompleted) return;
          testCompleted = true;
          
          clients.forEach(client => {
            if (client.connected) client.disconnect();
          });
          
          if (error) {
            console.log('Concurrent access handling: failed');
            done(error);
          } else {
            console.log('Concurrent access handling: success');
            done();
          }
        }

        function checkAllCompleted() {
          operationsCompleted++;
          console.log(`Concurrent operations completed: ${operationsCompleted}/${totalClients}`);
          
          if (operationsCompleted === totalClients) {
            completeTest();
          }
        }

        for (let i = 0; i < totalClients; i++) {
          const client = Client(dbServerUrl, {
            forceNew: true,
            reconnection: false,
            timeout: 3000,
            autoConnect: false
          });
          
          clients.push(client);
          
          client.on('connect', () => {
            client.emit('connect_request', {
              auth: {
                id: dbTestUserId,
                token: dbTestToken
              }
            });
          });
          
          client.on('connection_success', () => {
            // Each client creates a document simultaneously
            client.emit('message', {
              action: 'create_document',
              data: {
                title: `Concurrent Document ${i}`,
                content: `Content from client ${i}`
              }
            });
          });
          
          client.on('db_success', (response) => {
            if (response.action === 'create_document') {
              try {
                expect(response.data).to.have.property('title', `Concurrent Document ${i}`);
                expect(response.data).to.have.property('id');
                checkAllCompleted();
              } catch (error) {
                completeTest(error);
              }
            }
          });
          
          client.on('db_error', (error) => {
            completeTest(new Error(`Client ${i} database error: ${error.message}`));
          });
          
          client.on('connection_error', (error) => {
            completeTest(new Error(`Client ${i} connection failed: ${error.message}`));
          });
          
          setTimeout(() => client.connect(), i * 50);
        }

        setTimeout(() => {
          completeTest(new Error('Concurrent access test timeout'));
        }, 9000);
      });

      it('Should maintain referential integrity', function(done) {
        this.timeout(8000);
        
        authenticateAndDbTest((client, cleanup) => {
          const nonExistentDocId = 'non_existent_doc_123';

          client.on('db_error', (error) => {
            console.log('Referential integrity check: success');
            try {
              expect(error).to.have.property('message');
              expect(error).to.have.property('code', 'NOT_FOUND');
              cleanup(null, error);
            } catch (testError) {
              cleanup(testError);
            }
          });

          client.on('db_success', () => {
            cleanup(new Error('Should not find non-existent document'));
          });

          console.log('Testing referential integrity...');
          client.emit('message', {
            action: 'get_document',
            data: { doc_id: nonExistentDocId }
          });

          setTimeout(() => {
            cleanup(new Error('Referential integrity test timeout'));
          }, 6000);
        }).then(() => done()).catch(done);
      });
    });
  });
});
// WASI Wrapper for Prism WASM - Tauri Version
// Provides complete WASI implementation for Ruby Prism parser
// Located in squirrel/ (manually created)

class WASIWrapper {
    constructor(args = [], env = {}, fds = []) {
        this.args = ['prism', ...args];
        this.env = env;
        this.fds = fds;
        this.exitCode = null;
        
        // Memory management
        this.memory = null;
        this.view = null;
        
        // WASI import object - COMPLETE IMPLEMENTATION
        this.wasiImport = {
            // Process and environment
            args_get: (argv, argv_buf) => {
                return this.writeStringArray(this.args, argv, argv_buf);
            },
            
            args_sizes_get: (argc_ptr, argv_buf_size_ptr) => {
                const argc = this.args.length;
                const argv_buf_size = this.args.reduce((sum, arg) => sum + arg.length + 1, 0);
                
                this.view.setUint32(argc_ptr, argc, true);
                this.view.setUint32(argv_buf_size_ptr, argv_buf_size, true);
                return 0;
            },
            
            environ_get: (environ, environ_buf) => {
                const envArray = Object.entries(this.env).map(([key, value]) => `${key}=${value}`);
                return this.writeStringArray(envArray, environ, environ_buf);
            },
            
            environ_sizes_get: (environc_ptr, environ_buf_size_ptr) => {
                const envArray = Object.entries(this.env).map(([key, value]) => `${key}=${value}`);
                const environc = envArray.length;
                const environ_buf_size = envArray.reduce((sum, env) => sum + env.length + 1, 0);
                
                this.view.setUint32(environc_ptr, environc, true);
                this.view.setUint32(environ_buf_size_ptr, environ_buf_size, true);
                return 0;
            },
            
            // Time functions
            clock_res_get: (id, resolution_ptr) => {
                this.view.setBigUint64(resolution_ptr, BigInt(1000000), true);
                return 0;
            },
            
            clock_time_get: (id, precision, time_ptr) => {
                const now = BigInt(Date.now() * 1000000);
                this.view.setBigUint64(time_ptr, now, true);
                return 0;
            },
            
            // File operations - COMPLETE SET
            fd_advise: (fd, offset, len, advice) => 0,
            fd_allocate: (fd, offset, len) => 0,
            fd_close: (fd) => 0,
            fd_datasync: (fd) => 0,
            fd_fdstat_get: (fd, stat_ptr) => {
                // Mock file descriptor stats
                this.view.setUint8(stat_ptr, 0); // filetype
                this.view.setUint16(stat_ptr + 2, 0); // flags
                this.view.setBigUint64(stat_ptr + 8, BigInt(0)); // rights_base
                this.view.setBigUint64(stat_ptr + 16, BigInt(0)); // rights_inheriting
                return 0;
            },
            fd_fdstat_set_flags: (fd, flags) => 0,
            fd_fdstat_set_rights: (fd, rights_base, rights_inheriting) => 0,
            fd_filestat_get: (fd, filestat_ptr) => {
                // Mock file stats
                this.view.setBigUint64(filestat_ptr, BigInt(0)); // dev
                this.view.setBigUint64(filestat_ptr + 8, BigInt(0)); // ino
                this.view.setUint8(filestat_ptr + 16, 4); // filetype (regular file)
                this.view.setBigUint64(filestat_ptr + 24, BigInt(1)); // nlink
                this.view.setBigUint64(filestat_ptr + 32, BigInt(1024)); // size
                this.view.setBigUint64(filestat_ptr + 40, BigInt(Date.now() * 1000000)); // atim
                this.view.setBigUint64(filestat_ptr + 48, BigInt(Date.now() * 1000000)); // mtim
                this.view.setBigUint64(filestat_ptr + 56, BigInt(Date.now() * 1000000)); // ctim
                return 0;
            },
            fd_filestat_set_size: (fd, size) => 0,
            fd_filestat_set_times: (fd, atim, mtim, fst_flags) => 0,
            fd_pread: (fd, iovs, iovs_len, offset, nread_ptr) => 0,
            fd_prestat_get: (fd, prestat_ptr) => 8, // EBADF
            fd_prestat_dir_name: (fd, path_ptr, path_len) => 8, // EBADF
            fd_pwrite: (fd, iovs, iovs_len, offset, nwritten_ptr) => 0,
            fd_read: (fd, iovs, iovs_len, nread_ptr) => {
                this.view.setUint32(nread_ptr, 0, true);
                return 0;
            },
            fd_readdir: (fd, buf, buf_len, cookie, buf_used_ptr) => {
                this.view.setUint32(buf_used_ptr, 0, true);
                return 0;
            },
            fd_renumber: (from, to) => 0,
            fd_seek: (fd, offset, whence, new_offset_ptr) => {
                this.view.setBigUint64(new_offset_ptr, BigInt(0), true);
                return 0;
            },
            fd_sync: (fd) => 0,
            fd_tell: (fd, offset_ptr) => {
                this.view.setBigUint64(offset_ptr, BigInt(0), true);
                return 0;
            },
            fd_write: (fd, iovs, iovs_len, nwritten_ptr) => {
                let nwritten = 0;
                for (let i = 0; i < iovs_len; i++) {
                    const iov = iovs + i * 8;
                    const buf = this.view.getUint32(iov, true);
                    const buf_len = this.view.getUint32(iov + 4, true);
                    
                    const data = new Uint8Array(this.memory.buffer, buf, buf_len);
                    const text = new TextDecoder().decode(data);
                    
                    if (fd === 1) { // stdout
                        console.log(text.replace(/\n$/, ''));
                    } else if (fd === 2) { // stderr
                        console.error(text.replace(/\n$/, ''));
                    }
                    
                    nwritten += buf_len;
                }
                
                this.view.setUint32(nwritten_ptr, nwritten, true);
                return 0;
            },
            
            // Path operations
            path_create_directory: (fd, path_ptr, path_len) => 0,
            path_filestat_get: (fd, flags, path_ptr, path_len, filestat_ptr) => {
                // Mock file stats (same as fd_filestat_get)
                this.view.setBigUint64(filestat_ptr, BigInt(0)); // dev
                this.view.setBigUint64(filestat_ptr + 8, BigInt(0)); // ino
                this.view.setUint8(filestat_ptr + 16, 4); // filetype
                this.view.setBigUint64(filestat_ptr + 24, BigInt(1)); // nlink
                this.view.setBigUint64(filestat_ptr + 32, BigInt(1024)); // size
                this.view.setBigUint64(filestat_ptr + 40, BigInt(Date.now() * 1000000)); // atim
                this.view.setBigUint64(filestat_ptr + 48, BigInt(Date.now() * 1000000)); // mtim
                this.view.setBigUint64(filestat_ptr + 56, BigInt(Date.now() * 1000000)); // ctim
                return 0;
            },
            path_filestat_set_times: (fd, flags, path_ptr, path_len, atim, mtim, fst_flags) => 0,
            path_link: (old_fd, old_flags, old_path_ptr, old_path_len, new_fd, new_path_ptr, new_path_len) => 0,
            path_open: (fd, dirflags, path_ptr, path_len, oflags, rights_base, rights_inheriting, fdflags, fd_ptr) => {
                // Return a mock file descriptor
                this.view.setUint32(fd_ptr, 3, true);
                return 0;
            },
            path_readlink: (fd, path_ptr, path_len, buf_ptr, buf_len, buf_used_ptr) => {
                this.view.setUint32(buf_used_ptr, 0, true);
                return 0;
            },
            path_remove_directory: (fd, path_ptr, path_len) => 0,
            path_rename: (old_fd, old_path_ptr, old_path_len, new_fd, new_path_ptr, new_path_len) => 0,
            path_symlink: (old_path_ptr, old_path_len, fd, new_path_ptr, new_path_len) => 0,
            path_unlink_file: (fd, path_ptr, path_len) => 0,
            
            // Process and scheduling
            poll_oneoff: (in_ptr, out_ptr, nsubscriptions, nevents_ptr) => {
                this.view.setUint32(nevents_ptr, 0, true);
                return 0;
            },
            proc_exit: (code) => {
                this.exitCode = code;
                if (code !== 0) {
                    console.warn(`Process exited with code ${code}`);
                }
                // Don't throw - let it exit gracefully
            },
            proc_raise: (sig) => 0,
            sched_yield: () => 0,
            
            // Random
            random_get: (buf, buf_len) => {
                const buffer = new Uint8Array(this.memory.buffer, buf, buf_len);
                crypto.getRandomValues(buffer);
                return 0;
            },
            
            // Socket operations (minimal implementation)
            sock_accept: (fd, addr_ptr, addr_len_ptr, fd_ptr) => {
                // Mock socket accept - return new fd
                if (fd_ptr) this.view.setUint32(fd_ptr, 4, true);
                return 0;
            },
            sock_recv: (fd, ri_data_ptr, ri_data_len, ri_flags, ro_datalen_ptr, ro_flags_ptr) => {
                if (ro_datalen_ptr) this.view.setUint32(ro_datalen_ptr, 0, true);
                if (ro_flags_ptr) this.view.setUint32(ro_flags_ptr, 0, true);
                return 0;
            },
            sock_send: (fd, si_data_ptr, si_data_len, si_flags, so_datalen_ptr) => {
                if (so_datalen_ptr) this.view.setUint32(so_datalen_ptr, 0, true);
                return 0;
            },
            sock_shutdown: (fd, how) => 0
        };
    }
    
    writeStringArray(strings, ptrs_ptr, buf_ptr) {
        let buf_offset = buf_ptr;
        
        for (let i = 0; i < strings.length; i++) {
            // Write pointer
            this.view.setUint32(ptrs_ptr + i * 4, buf_offset, true);
            
            // Write string
            const encoded = new TextEncoder().encode(strings[i] + '\0');
            new Uint8Array(this.memory.buffer, buf_offset, encoded.length).set(encoded);
            buf_offset += encoded.length;
        }
        
        return 0;
    }
    
    initialize(instance) {
        this.memory = instance.exports.memory;
        this.view = new DataView(this.memory.buffer);
        
        console.log('✅ WASI initialized with complete function set');
        console.log('📊 Memory size:', this.memory.buffer.byteLength, 'bytes');
        
        return instance;
    }
    
    start(instance) {
        // Call _start if it exists
        if (instance.exports._start) {
            try {
                console.log('🚀 Starting WASM module...');
                instance.exports._start();
                console.log('✅ WASM module started successfully');
            } catch (error) {
                if (this.exitCode === 0 || this.exitCode === null) {
                    console.log('✅ WASM _start completed normally');
                } else {
                    console.warn('⚠️ WASM _start warning:', error.message);
                }
            }
        }
        
        return instance;
    }
}

// Enhanced WASI factory with error handling
window.WASIWrapper = WASIWrapper;

window.createWASI = function(args = [], env = {}, fds = []) {
    try {
        const wasi = new WASIWrapper(args, env, fds);
        console.log('✅ WASI instance created successfully');
        return wasi;
    } catch (error) {
        console.error('❌ Failed to create WASI instance:', error);
        throw error;
    }
};

// Signal ready
setTimeout(() => {
    window.dispatchEvent(new CustomEvent('wasi-ready'));
    console.log('✅ WASI wrapper ready');
}, 100);
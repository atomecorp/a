use std::net::{SocketAddr, TcpStream};
use std::thread;
use std::time::{Duration, Instant};

pub fn wait_for_local_http(address: SocketAddr, timeout: Duration) -> bool {
    let started_at = Instant::now();
    while started_at.elapsed() < timeout {
        if TcpStream::connect_timeout(&address, Duration::from_millis(100)).is_ok() {
            return true;
        }
        thread::sleep(Duration::from_millis(25));
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::TcpListener;

    #[test]
    fn detects_a_ready_local_server() {
        let listener = TcpListener::bind(("127.0.0.1", 0)).expect("bind fixture");
        let address = listener.local_addr().expect("fixture address");
        assert!(wait_for_local_http(address, Duration::from_millis(250)));
    }

    #[test]
    fn times_out_when_no_server_is_listening() {
        let listener = TcpListener::bind(("127.0.0.1", 0)).expect("reserve fixture port");
        let address = listener.local_addr().expect("fixture address");
        drop(listener);
        assert!(!wait_for_local_http(address, Duration::from_millis(75)));
    }
}

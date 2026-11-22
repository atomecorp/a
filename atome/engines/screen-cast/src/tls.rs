//! TLS to a Chromecast: the device presents a certificate signed by Google's device CA, not by a web root, and it is
//! reached by its local address, never by a name a certificate could carry. Cast senders therefore do not check the
//! certificate chain against web roots; the session is still encrypted. This verifier accepts the device's
//! certificate and checks every handshake signature, so only the chain check is left out.

use std::sync::Arc;

use tokio::net::TcpStream;
use tokio_rustls::TlsConnector;
use tokio_rustls::client::TlsStream;
use tokio_rustls::rustls::client::danger::{
    HandshakeSignatureValid, ServerCertVerified, ServerCertVerifier,
};
use tokio_rustls::rustls::crypto::{
    CryptoProvider, ring, verify_tls12_signature, verify_tls13_signature,
};
use tokio_rustls::rustls::pki_types::{CertificateDer, IpAddr, ServerName, UnixTime};
use tokio_rustls::rustls::{ClientConfig, DigitallySignedStruct, Error, SignatureScheme};

use crate::ScreenError;

#[derive(Debug)]
struct LocalDevice(Arc<CryptoProvider>);

impl ServerCertVerifier for LocalDevice {
    fn verify_server_cert(
        &self,
        _: &CertificateDer<'_>,
        _: &[CertificateDer<'_>],
        _: &ServerName<'_>,
        _: &[u8],
        _: UnixTime,
    ) -> Result<ServerCertVerified, Error> {
        Ok(ServerCertVerified::assertion())
    }

    fn verify_tls12_signature(
        &self,
        message: &[u8],
        cert: &CertificateDer<'_>,
        dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, Error> {
        verify_tls12_signature(
            message,
            cert,
            dss,
            &self.0.signature_verification_algorithms,
        )
    }

    fn verify_tls13_signature(
        &self,
        message: &[u8],
        cert: &CertificateDer<'_>,
        dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, Error> {
        verify_tls13_signature(
            message,
            cert,
            dss,
            &self.0.signature_verification_algorithms,
        )
    }

    fn supported_verify_schemes(&self) -> Vec<SignatureScheme> {
        self.0.signature_verification_algorithms.supported_schemes()
    }
}

/// An encrypted stream to a device of the local network at `address`.
pub async fn connect_local_device(
    address: std::net::SocketAddr,
) -> Result<TlsStream<TcpStream>, ScreenError> {
    let provider = Arc::new(ring::default_provider());
    let config = ClientConfig::builder_with_provider(provider.clone())
        .with_safe_default_protocol_versions()
        .map_err(|error| ScreenError::Io(error.to_string()))?
        .dangerous()
        .with_custom_certificate_verifier(Arc::new(LocalDevice(provider)))
        .with_no_client_auth();
    let tcp = TcpStream::connect(address)
        .await
        .map_err(|error| ScreenError::Unreachable(error.to_string()))?;
    let name = ServerName::IpAddress(IpAddr::from(address.ip()));
    TlsConnector::from(Arc::new(config))
        .connect(name, tcp)
        .await
        .map_err(|error| ScreenError::Unreachable(error.to_string()))
}

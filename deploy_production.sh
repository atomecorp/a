#!/bin/bash

# Squirrel Framework - Production Deployment Script for FreeBSD 11
# This script automates the deployment of the authentication system

set -e  # Exit on any error

echo "🐿️ Squirrel Framework - Production Deployment"
echo "============================================="

# Configuration
PROJECT_DIR="$HOME/squirrel"
DOMAIN_NAME="yourdomain.com"
DB_NAME="squirrel_framework"
NGINX_CONF="/usr/local/etc/nginx/nginx.conf"
SERVICE_USER="squirrel"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    log_error "This script must be run as root"
    exit 1
fi

# Function to install packages
install_packages() {
    log_info "Installing required packages..."
    
    pkg update
    pkg install -y \
        node \
        npm \
        nginx \
        postgresql13-server \
        postgresql13-client \
        py39-certbot \
        py39-certbot-nginx \
        git \
        curl
    
    log_success "Packages installed successfully"
}

# Function to create service user
create_service_user() {
    log_info "Creating service user: $SERVICE_USER"
    
    if ! id "$SERVICE_USER" &>/dev/null; then
        pw useradd "$SERVICE_USER" -m -s /bin/sh -c "Squirrel Framework Service User"
        log_success "User $SERVICE_USER created"
    else
        log_warning "User $SERVICE_USER already exists"
    fi
}

# Function to setup PostgreSQL
setup_postgresql() {
    log_info "Setting up PostgreSQL..."
    
    # Enable PostgreSQL service
    sysrc postgresql_enable="YES"
    
    # Initialize database if not exists
    if [ ! -d "/var/db/postgres/data13" ]; then
        service postgresql initdb
        log_success "PostgreSQL initialized"
    fi
    
    # Start PostgreSQL
    service postgresql start
    
    # Create database and user
    sudo -u postgres createdb "$DB_NAME" 2>/dev/null || log_warning "Database $DB_NAME already exists"
    sudo -u postgres psql -c "CREATE USER $SERVICE_USER WITH PASSWORD 'secure_password';" 2>/dev/null || log_warning "User $SERVICE_USER already exists in PostgreSQL"
    sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $SERVICE_USER;"
    
    log_success "PostgreSQL setup completed"
}

# Function to deploy application
deploy_application() {
    log_info "Deploying Squirrel Framework application..."
    
    # Create project directory
    mkdir -p "$PROJECT_DIR"
    cd "$PROJECT_DIR"
    
    # Clone or update repository (replace with your actual repository)
    if [ -d ".git" ]; then
        git pull origin main
        log_info "Repository updated"
    else
        # For now, we'll copy from the development directory
        # In production, replace this with: git clone https://github.com/your-org/squirrel-framework.git .
        log_warning "Copying from development directory (replace with git clone in production)"
        rsync -av --exclude=node_modules --exclude=.git /path/to/dev/squirrel/ ./
    fi
    
    # Install dependencies
    npm install --production
    
    # Copy environment configuration
    if [ ! -f ".env" ]; then
        cp .env.example .env
        log_warning "Please edit .env file with your production settings"
    fi
    
    # Run database migrations
    npx knex migrate:latest --knexfile knexfile.cjs
    
    # Change ownership
    chown -R "$SERVICE_USER:$SERVICE_USER" "$PROJECT_DIR"
    
    log_success "Application deployed successfully"
}

# Function to setup SSL certificates
setup_ssl() {
    log_info "Setting up SSL certificates with Let's Encrypt..."
    
    # Temporary NGINX config for certificate generation
    cat > /tmp/nginx_temp.conf << EOF
server {
    listen 80;
    server_name $DOMAIN_NAME www.$DOMAIN_NAME;
    
    location /.well-known/acme-challenge/ {
        root /usr/local/www/nginx;
    }
    
    location / {
        return 301 https://\$host\$request_uri;
    }
}
EOF
    
    # Backup existing config
    cp "$NGINX_CONF" "${NGINX_CONF}.backup"
    
    # Apply temporary config
    cp /tmp/nginx_temp.conf "$NGINX_CONF"
    nginx -t && service nginx restart
    
    # Generate certificates
    certbot certonly --webroot -w /usr/local/www/nginx -d "$DOMAIN_NAME" -d "www.$DOMAIN_NAME" --agree-tos --non-interactive --email "admin@$DOMAIN_NAME"
    
    log_success "SSL certificates generated"
}

# Function to configure NGINX
configure_nginx() {
    log_info "Configuring NGINX..."
    
    cat > "$NGINX_CONF" << EOF
user www;
worker_processes auto;

events {
    worker_connections 1024;
}

http {
    include       mime.types;
    default_type  application/octet-stream;
    
    sendfile        on;
    tcp_nopush      on;
    tcp_nodelay     on;
    keepalive_timeout 65;
    types_hash_max_size 2048;
    
    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;
    
    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    
    # Rate limiting
    limit_req_zone \$binary_remote_addr zone=api:10m rate=10r/s;
    limit_req_zone \$binary_remote_addr zone=auth:10m rate=5r/m;
    
    # HTTP redirect to HTTPS
    server {
        listen 80;
        server_name $DOMAIN_NAME www.$DOMAIN_NAME;
        
        location /.well-known/acme-challenge/ {
            root /usr/local/www/nginx;
        }
        
        location / {
            return 301 https://\$host\$request_uri;
        }
    }
    
    # HTTPS server
    server {
        listen 443 ssl http2;
        server_name $DOMAIN_NAME www.$DOMAIN_NAME;
        
        # SSL configuration
        ssl_certificate /usr/local/etc/letsencrypt/live/$DOMAIN_NAME/fullchain.pem;
        ssl_certificate_key /usr/local/etc/letsencrypt/live/$DOMAIN_NAME/privkey.pem;
        
        ssl_session_timeout 1d;
        ssl_session_cache shared:SSL:50m;
        ssl_session_tickets off;
        
        # Modern configuration
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384;
        ssl_prefer_server_ciphers off;
        
        # OCSP stapling
        ssl_stapling on;
        ssl_stapling_verify on;
        
        # API routes with rate limiting
        location /api/auth/ {
            limit_req zone=auth burst=5 nodelay;
            
            proxy_pass http://127.0.0.1:3001;
            proxy_http_version 1.1;
            proxy_set_header Upgrade \$http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host \$host;
            proxy_set_header X-Real-IP \$remote_addr;
            proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto \$scheme;
            proxy_cache_bypass \$http_upgrade;
        }
        
        location /api/ {
            limit_req zone=api burst=20 nodelay;
            
            proxy_pass http://127.0.0.1:3001;
            proxy_http_version 1.1;
            proxy_set_header Upgrade \$http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host \$host;
            proxy_set_header X-Real-IP \$remote_addr;
            proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto \$scheme;
            proxy_cache_bypass \$http_upgrade;
        }
        
        # WebSocket support
        location /ws {
            proxy_pass http://127.0.0.1:3001;
            proxy_http_version 1.1;
            proxy_set_header Upgrade \$http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host \$host;
            proxy_set_header X-Real-IP \$remote_addr;
            proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto \$scheme;
        }
        
        # Static files and main app
        location / {
            proxy_pass http://127.0.0.1:3001;
            proxy_http_version 1.1;
            proxy_set_header Upgrade \$http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host \$host;
            proxy_set_header X-Real-IP \$remote_addr;
            proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto \$scheme;
            proxy_cache_bypass \$http_upgrade;
        }
    }
}
EOF
    
    # Test configuration
    nginx -t
    
    log_success "NGINX configured successfully"
}

# Function to create systemd service (FreeBSD uses rc.d)
create_service() {
    log_info "Creating system service..."
    
    cat > /usr/local/etc/rc.d/squirrel << 'EOF'
#!/bin/sh

# PROVIDE: squirrel
# REQUIRE: LOGIN postgresql nginx
# KEYWORD: shutdown

. /etc/rc.subr

name="squirrel"
rcvar="squirrel_enable"

load_rc_config $name

: ${squirrel_enable:="NO"}
: ${squirrel_user:="squirrel"}
: ${squirrel_dir:="/home/squirrel/squirrel"}
: ${squirrel_env:="NODE_ENV=production"}

pidfile="/var/run/squirrel.pid"
command="/usr/local/bin/node"
command_args="server/server.js"

start_cmd="squirrel_start"
stop_cmd="squirrel_stop"

squirrel_start() {
    echo "Starting Squirrel Framework..."
    cd ${squirrel_dir}
    /usr/sbin/daemon -c -f -P ${pidfile} -u ${squirrel_user} env ${squirrel_env} ${command} ${command_args}
}

squirrel_stop() {
    echo "Stopping Squirrel Framework..."
    if [ -f ${pidfile} ]; then
        kill `cat ${pidfile}`
        rm -f ${pidfile}
    fi
}

run_rc_command "$1"
EOF
    
    chmod +x /usr/local/etc/rc.d/squirrel
    sysrc squirrel_enable="YES"
    
    log_success "System service created"
}

# Function to setup log rotation
setup_logging() {
    log_info "Setting up logging..."
    
    mkdir -p "$PROJECT_DIR/logs"
    chown -R "$SERVICE_USER:$SERVICE_USER" "$PROJECT_DIR/logs"
    
    # Create newsyslog entry for log rotation
    cat >> /etc/newsyslog.conf << EOF
$PROJECT_DIR/logs/squirrel.log    $SERVICE_USER:$SERVICE_USER    644  7     *    @T00  JC
EOF
    
    log_success "Logging configured"
}

# Function to setup certificate renewal
setup_cert_renewal() {
    log_info "Setting up certificate auto-renewal..."
    
    # Add cron job for certificate renewal
    (crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet && service nginx reload") | crontab -
    
    log_success "Certificate auto-renewal configured"
}

# Function to setup firewall
setup_firewall() {
    log_info "Setting up firewall rules..."
    
    # Enable pf firewall
    sysrc pf_enable="YES"
    
    cat > /etc/pf.conf << EOF
# Squirrel Framework Firewall Configuration

# Macros
ext_if = "em0"  # Adjust to your network interface
tcp_services = "{ 22, 80, 443 }"
icmp_types = "{ echoreq, unreach }"

# Default deny
set block-policy return
set loginterface $ext_if

# Skip filtering on loopback
set skip on lo0

# Scrub packets
scrub in on $ext_if all fragment reassemble

# Default rules
block in log all
pass out all keep state

# Allow SSH (limit to prevent brute force)
pass in on $ext_if proto tcp to any port 22 flags S/SA keep state (max-src-conn 10, max-src-conn-rate 5/30, overload <bruteforce> flush global)

# Allow HTTP and HTTPS
pass in on $ext_if proto tcp to any port { 80, 443 } flags S/SA keep state

# Allow ICMP
pass in on $ext_if proto icmp icmp-type $icmp_types keep state

# Table for brute force protection
table <bruteforce> persist
block drop in quick on $ext_if from <bruteforce>
EOF
    
    # Start pf
    service pf start
    
    log_success "Firewall configured and started"
}

# Main deployment function
main() {
    log_info "Starting Squirrel Framework deployment..."
    
    # Check if domain name is configured
    if [ "$DOMAIN_NAME" = "yourdomain.com" ]; then
        log_error "Please configure DOMAIN_NAME variable in this script"
        exit 1
    fi
    
    install_packages
    create_service_user
    setup_postgresql
    deploy_application
    setup_ssl
    configure_nginx
    create_service
    setup_logging
    setup_cert_renewal
    setup_firewall
    
    # Start services
    service nginx restart
    service squirrel start
    
    log_success "Deployment completed successfully!"
    echo ""
    echo "🎉 Squirrel Framework is now running!"
    echo "📱 Application: https://$DOMAIN_NAME"
    echo "🧪 Auth Test: https://$DOMAIN_NAME/auth-test"
    echo "🔐 Admin: https://$DOMAIN_NAME/admin"
    echo ""
    echo "📋 Next steps:"
    echo "1. Edit $PROJECT_DIR/.env with your production settings"
    echo "2. Configure your DNS to point to this server"
    echo "3. Test the authentication system"
    echo "4. Monitor logs in $PROJECT_DIR/logs/"
    echo ""
    echo "🔧 Management commands:"
    echo "  Start:   service squirrel start"
    echo "  Stop:    service squirrel stop"
    echo "  Restart: service squirrel restart"
    echo "  Status:  service squirrel status"
}

# Run main function
main "$@"

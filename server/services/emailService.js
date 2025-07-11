import nodemailer from 'nodemailer';

class EmailService {
  constructor() {
    this.transporter = null;
    this.initializeTransporter();
  }

  initializeTransporter() {
    // Configuration for different mail servers
    const emailConfig = {
      // For development/testing (use test account or mock)
      development: {
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: 'test@test.com',
          pass: 'testpass'
        }
      },
      
      // For production (configure according to your SMTP server)
      production: {
        host: process.env.SMTP_HOST || 'localhost',
        port: process.env.SMTP_PORT || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      }
    };

    const env = process.env.NODE_ENV || 'development';
    
    // For development, create a test account or mock transporter
    if (env === 'development') {
      // Mock transporter for development
      this.transporter = {
        sendMail: async (mailOptions) => {
          console.log('📧 [MOCK EMAIL] Sending email:');
          console.log('📧 To:', mailOptions.to);
          console.log('📧 Subject:', mailOptions.subject);
          console.log('📧 Content preview:', mailOptions.text?.substring(0, 100) + '...');
          
          return {
            messageId: 'mock-' + Date.now(),
            accepted: [mailOptions.to],
            rejected: []
          };
        },
        verify: async () => true
      };
    } else {
      this.transporter = nodemailer.createTransport(emailConfig[env]);
    }
  }

  async sendPasswordResetEmail(email, resetToken, userName = '') {
    const resetUrl = `${process.env.APP_URL || 'http://localhost:3001'}/account/reset/${resetToken}`;
    
    const mailOptions = {
      from: process.env.FROM_EMAIL || 'noreply@squirrel-framework.com',
      to: email,
      subject: 'Password Reset Request - Squirrel Framework',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Password Reset</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #2c3e50; color: white; padding: 20px; text-align: center; }
            .content { background: #f9f9f9; padding: 30px; border: 1px solid #ddd; }
            .button { display: inline-block; background: #3498db; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .warning { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🐿️ Squirrel Framework</h1>
            </div>
            <div class="content">
              <h2>Password Reset Request</h2>
              <p>Hello ${userName || 'User'},</p>
              <p>We received a request to reset your password for your Squirrel Framework account.</p>
              
              <p>Click the button below to reset your password:</p>
              <a href="${resetUrl}" class="button">Reset Password</a>
              
              <p>Or copy and paste this link in your browser:</p>
              <p style="word-break: break-all; background: #f5f5f5; padding: 10px; border-radius: 3px;">
                ${resetUrl}
              </p>
              
              <div class="warning">
                <strong>⚠️ Important:</strong>
                <ul>
                  <li>This link will expire in 15 minutes</li>
                  <li>If you didn't request this reset, please ignore this email</li>
                  <li>Never share this link with anyone</li>
                </ul>
              </div>
              
              <p>For security reasons, this link can only be used once.</p>
            </div>
            <div class="footer">
              <p>This is an automated message from Squirrel Framework.</p>
              <p>If you need help, contact our support team.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
        Password Reset Request - Squirrel Framework
        
        Hello ${userName || 'User'},
        
        We received a request to reset your password for your Squirrel Framework account.
        
        Please click the following link to reset your password:
        ${resetUrl}
        
        This link will expire in 15 minutes.
        
        If you didn't request this reset, please ignore this email.
        
        For security reasons, this link can only be used once.
        
        ---
        Squirrel Framework Team
      `
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      console.log('Password reset email sent:', info.messageId);
      
      // For development, log the preview URL
      if (process.env.NODE_ENV === 'development') {
        console.log('Preview URL:', nodemailer.getTestMessageUrl(info));
      }
      
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('Error sending password reset email:', error);
      throw new Error('Failed to send password reset email');
    }
  }

  async sendWelcomeEmail(email, userName = '') {
    const loginUrl = `${process.env.APP_URL || 'http://localhost:3001'}/login`;
    
    const mailOptions = {
      from: process.env.FROM_EMAIL || 'noreply@squirrel-framework.com',
      to: email,
      subject: 'Welcome to Squirrel Framework! 🐿️',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Welcome to Squirrel Framework</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #27ae60; color: white; padding: 20px; text-align: center; }
            .content { background: #f9f9f9; padding: 30px; border: 1px solid #ddd; }
            .button { display: inline-block; background: #3498db; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🐿️ Welcome to Squirrel Framework!</h1>
            </div>
            <div class="content">
              <h2>Account Created Successfully</h2>
              <p>Hello ${userName || 'User'},</p>
              <p>Welcome to Squirrel Framework! Your account has been created successfully.</p>
              
              <p>You can now log in and start building amazing applications:</p>
              <a href="${loginUrl}" class="button">Log In to Your Account</a>
              
              <h3>Getting Started:</h3>
              <ul>
                <li>Explore the framework documentation</li>
                <li>Create your first project</li>
                <li>Join our community</li>
              </ul>
              
              <p>If you have any questions, feel free to reach out to our support team.</p>
            </div>
            <div class="footer">
              <p>Thank you for choosing Squirrel Framework!</p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      console.log('Welcome email sent:', info.messageId);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('Error sending welcome email:', error);
      // Don't throw error for welcome email - account creation should still succeed
      return { success: false, error: error.message };
    }
  }

  async testConnection() {
    try {
      await this.transporter.verify();
      console.log('✅ SMTP server connection successful');
      return true;
    } catch (error) {
      console.error('❌ SMTP server connection failed:', error);
      return false;
    }
  }
}

// Export singleton instance
export default new EmailService();

export const up = function(knex) {
  return knex.schema.alterTable('user', function(table) {
    // Add email column first 
    table.string('email', 255).nullable();
    
    // Add phone number
    table.string('phone', 20).nullable();
    
    // Email and phone verification
    table.boolean('email_verified').defaultTo(false);
    table.boolean('phone_verified').defaultTo(false);
    
    // Password reset tokens
    table.string('reset_token', 255).nullable();
    table.timestamp('reset_token_expires').nullable();
    
    // Brute force protection
    table.integer('failed_login_attempts').defaultTo(0);
    table.timestamp('locked_until').nullable();
    
    // Last login tracking
    table.timestamp('last_login').nullable();
    
    // Make name nullable (email is the primary identifier now)
    table.string('name', 255).nullable().alter();
  })
  .then(() => {
    // Now add unique constraint on email in a separate step
    return knex.schema.alterTable('user', function(table) {
      table.unique('email');
    });
  });
};

export const down = function(knex) {
  return knex.schema.alterTable('user', function(table) {
    table.dropColumn('email');
    table.dropColumn('phone');
    table.dropColumn('email_verified');
    table.dropColumn('phone_verified');
    table.dropColumn('reset_token');
    table.dropColumn('reset_token_expires');
    table.dropColumn('failed_login_attempts');
    table.dropColumn('locked_until');
    table.dropColumn('last_login');
    
    // Restore name as required
    table.string('name', 255).notNullable().alter();
  });
};

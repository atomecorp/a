export const up = function(knex) {
  return knex.schema
    .createTable('project', function(table) {
      table.increments('id').primary();
      table.string('name_project', 255).notNullable();
      table.text('history_action').defaultTo('[]'); // JSON string for action history
      table.enum('autorisation', ['private', 'public', 'restricted']).defaultTo('private');
      table.integer('user_id').unsigned();
      table.timestamps(true, true);
    })
    .createTable('user', function(table) {
      table.increments('id').primary();
      table.string('name', 255).notNullable();
      table.string('password', 255).notNullable();
      table.enum('autorisation', ['read', 'edit', 'admin']).defaultTo('read');
      table.integer('project_id').unsigned();
      table.timestamps(true, true);
      
      // Foreign key reference to project
      table.foreign('project_id').references('id').inTable('project').onDelete('SET NULL');
    })
    .createTable('atome', function(table) {
      table.increments('id').primary();
      table.integer('user_id').unsigned().notNullable();
      table.integer('project_id').unsigned().notNullable();
      table.string('name_project', 255).notNullable();
      table.timestamps(true, true);
      
      // Foreign key references
      table.foreign('user_id').references('id').inTable('user').onDelete('CASCADE');
      table.foreign('project_id').references('id').inTable('project').onDelete('CASCADE');
    })
    .then(() => {
      // Add foreign key reference from project to user (owner)
      return knex.schema.alterTable('project', function(table) {
        table.foreign('user_id').references('id').inTable('user').onDelete('SET NULL');
      });
    });
};

export const down = function(knex) {
  return knex.schema
    .dropTableIfExists('atome')
    .dropTableIfExists('user')
    .dropTableIfExists('project');
};

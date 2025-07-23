// Migration runner for Supabase
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// Create migrations tracking table
async function createMigrationsTable() {
  // Test if table exists by trying to query it
  const { data, error } = await supabase
    .from('schema_migrations')
    .select('id')
    .limit(1);
    
  if (!error) {
    console.log('✅ schema_migrations table found');
    return true;
  }
  
  // Table doesn't exist, show manual creation instructions
  console.log('❌ schema_migrations table not found');
  console.log('Please run this SQL in your Supabase SQL editor:');
  console.log(`
CREATE TABLE IF NOT EXISTS schema_migrations (
  id SERIAL PRIMARY KEY,
  filename VARCHAR NOT NULL UNIQUE,
  executed_at TIMESTAMPTZ DEFAULT NOW()
);
  `);
  
  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  await new Promise(resolve => {
    readline.question('Have you created the schema_migrations table? (y/n): ', (answer) => {
      if (answer.toLowerCase() !== 'y') {
        console.log('Please create the table first and run this again.');
        process.exit(1);
      }
      readline.close();
      resolve();
    });
  });
  
  return true;
}

// Get executed migrations
async function getExecutedMigrations() {
  const { data, error } = await supabase
    .from('schema_migrations')
    .select('filename')
    .order('executed_at');
    
  if (error) {
    console.log('⚠️  Could not check migration history. Assuming fresh start.');
    return [];
  }
  
  return data.map(row => row.filename);
}

// Execute SQL migration
async function executeMigration(filename, sql) {
  console.log(`\n▶️  Running migration: ${filename}`);
  
  // Try using RPC first
  const { error } = await supabase.rpc('exec_sql', { sql });
  
  if (error) {
    if (error.message.includes('function public.exec_sql')) {
      // RPC method not available, show manual instructions
      console.log(`\n⚠️  Automatic execution not available. Please run this SQL manually in Supabase SQL editor:`);
      console.log(`\n--- ${filename} ---`);
      console.log(sql);
      console.log(`--- End ${filename} ---\n`);
      
      // Ask user to confirm they've run it
      const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      await new Promise(resolve => {
        readline.question('Have you executed this migration manually? (y/n): ', (answer) => {
          if (answer.toLowerCase() === 'y') {
            console.log('✅ Migration marked as completed');
          } else {
            console.log('❌ Migration skipped');
            process.exit(1);
          }
          readline.close();
          resolve();
        });
      });
      
    } else {
      console.error(`❌ Migration ${filename} failed:`, error.message);
      return false;
    }
  } else {
    console.log(`✅ Migration ${filename} completed successfully`);
  }
  
  // Record migration as executed
  const { error: recordError } = await supabase
    .from('schema_migrations')
    .insert({ filename });
    
  if (recordError) {
    console.log(`⚠️  Could not record migration ${filename} in history`);
  }
  
  return true;
}

// Main migration runner
async function runMigrations() {
  console.log('🚀 STARTING DATABASE MIGRATIONS...\n');
  
  // Ensure migrations table exists
  const tablesReady = await createMigrationsTable();
  if (!tablesReady) {
    console.log('Please create the schema_migrations table first and run this again.');
    return;
  }
  
  // Get migration files
  const migrationFiles = fs.readdirSync(__dirname)
    .filter(file => file.endsWith('.sql'))
    .sort();
    
  if (migrationFiles.length === 0) {
    console.log('No migration files found in migrations folder');
    return;
  }
  
  // Get already executed migrations
  const executedMigrations = await getExecutedMigrations();
  
  // Run new migrations
  let executedCount = 0;
  for (const filename of migrationFiles) {
    if (executedMigrations.includes(filename)) {
      console.log(`⏭️  Skipping ${filename} (already executed)`);
      continue;
    }
    
    const filepath = path.join(__dirname, filename);
    const sql = fs.readFileSync(filepath, 'utf8');
    
    const success = await executeMigration(filename, sql);
    if (success) {
      executedCount++;
    } else {
      console.log(`\n❌ Migration process stopped at ${filename}`);
      break;
    }
  }
  
  console.log(`\n🎉 MIGRATIONS COMPLETE: ${executedCount} new migrations executed`);
  console.log('\nYour database relationships are now managed with views!');
  console.log('Complex calculations happen server-side, eliminating client/server confusion.');
}

// Handle command line execution
if (require.main === module) {
  runMigrations().catch(console.error);
}

module.exports = { runMigrations };

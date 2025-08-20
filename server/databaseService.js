const { Pool } = require('pg')
require('dotenv').config()

class DatabaseService {
  constructor() {
    this.pool = null
  }

  async connect() {
    try {
      this.pool = new Pool({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT || 5432,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        ssl: {
          rejectUnauthorized: false
        }
      })
      
      await this.pool.query('SELECT 1')
      console.log('✅ Conectado ao banco PostgreSQL')
      
    } catch (error) {
      console.error('❌ Erro ao conectar ao banco:', error)
      throw error
    }
  }

  async getPhoneByCode(code) {
    try {
      const query = `
        SELECT codigo, telefone, nome 
        FROM usuarios 
        WHERE codigo = $1 AND ativo = true
      `
      const result = await this.pool.query(query, [code])
      
      if (result.rows.length > 0) {
        return result.rows[0]
      }
      
      return null
      
    } catch (error) {
      console.error(`❌ Erro ao buscar código ${code}:`, error)
      throw error
    }
  }

  disconnect() {
    if (this.pool) {
      this.pool.end()
    }
  }
}

module.exports = DatabaseService

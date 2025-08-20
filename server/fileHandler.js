const fs = require('fs/promises')
const path = require('path')

class FileHandler {
  constructor() {
    this.uploadsPath = path.join(__dirname, 'uploads')
    this.ensureUploadsDir()
  }

  async ensureUploadsDir() {
    try {
      await fs.access(this.uploadsPath)
    } catch {
      await fs.mkdir(this.uploadsPath, { recursive: true })
    }
  }

  async handleFileUpload(socket, data) {
    try {
      const { filename, content, type } = data
      const filePath = path.join(this.uploadsPath, filename)
      
      // Converter base64 para buffer
      const buffer = Buffer.from(content, 'base64')
      await fs.writeFile(filePath, buffer)
      
      socket.emit('file:uploaded', { 
        success: true, 
        filename,
        path: filePath 
      })
      
      console.log(`📁 Arquivo salvo: ${filename}`)
    } catch (error) {
      console.error('❌ Erro ao salvar arquivo:', error)
      socket.emit('file:uploaded', { 
        success: false, 
        error: error.message 
      })
    }
  }
}

module.exports = FileHandler
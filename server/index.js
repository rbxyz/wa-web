const express = require('express')
const cors = require('cors')
const http = require('http')
const socketIo = require('socket.io')
const path = require('path')
const WhatsAppHandler = require('./whatsappHandler')
const FileHandler = require('./fileHandler')

const app = express()
const server = http.createServer(app)
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"]
  }
})

// Middleware
app.use(cors())
app.use(express.json())
app.use(express.static(path.join(__dirname, '../dist')))

// Rotas
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() })
})

// Rota para buscar números de telefone
app.post('/api/phone-numbers', async (req, res) => {
  try {
    const { codes } = req.body
    
    if (!codes || !Array.isArray(codes)) {
      return res.status(400).json({ error: 'Códigos inválidos' })
    }

    console.log(`📞 Buscando números para ${codes.length} códigos:`, codes)

    const DatabaseService = require('./databaseService')
    const db = new DatabaseService()
    await db.connect()

    const phoneNumbers = []
    
    for (const code of codes) {
      try {
        const telefone = await db.getPhoneByCode(code)
        if (telefone) {
          phoneNumbers.push({
            code,
            telefone: telefone.telefone,
            nome: telefone.nome || 'N/A'
          })
          console.log(`✅ Encontrado: ${code} -> ${telefone.telefone} (${telefone.nome})`)
        } else {
          console.log(`❌ Não encontrado: ${code}`)
        }
      } catch (error) {
        console.error(`❌ Erro ao buscar código ${code}:`, error.message)
      }
    }

    console.log(`📊 Total encontrados: ${phoneNumbers.length}/${codes.length}`)
    res.json({ phoneNumbers })
    
  } catch (error) {
    console.error('❌ Erro na API de números:', error)
    res.status(500).json({ error: error.message })
  }
})

// Rota para limpar sessões
app.post('/api/clear-sessions', async (req, res) => {
  try {
    console.log('🗑️ Solicitação de limpeza de sessões recebida')
    await whatsappHandler.clearOldSessions()
    res.json({ success: true, message: 'Sessões antigas removidas' })
  } catch (error) {
    console.error('❌ Erro ao limpar sessões:', error)
    res.status(500).json({ error: error.message })
  }
})

// Rota para forçar reconexão
app.post('/api/force-reconnect', async (req, res) => {
  try {
    console.log('🔄 Solicitação de reconexão forçada recebida')
    await whatsappHandler.forceReconnect()
    res.json({ success: true, message: 'Reconexão forçada iniciada' })
  } catch (error) {
    console.error('❌ Erro ao forçar reconexão:', error)
    res.status(500).json({ error: error.message })
  }
})

// Rota para teste de envio direto
app.post('/api/test-send', async (req, res) => {
  try {
    const { numero, mensagem } = req.body
    console.log(`🧪 Teste de envio: ${numero} - ${mensagem}`)
    await whatsappHandler.sendMessage(numero, mensagem)
    res.json({ success: true, message: 'Mensagem enviada com sucesso' })
  } catch (error) {
    console.error('❌ Erro no teste de envio:', error)
    res.status(500).json({ error: error.message })
  }
})

// Inicializar handlers
const whatsappHandler = new WhatsAppHandler(io)
const fileHandler = new FileHandler()

// Socket.io events
io.on('connection', (socket) => {
  console.log('🔌 Cliente conectado:', socket.id)
  
  socket.on('whatsapp:connect', () => {
    console.log('📞 Solicitação de conexão WhatsApp recebida do socket:', socket.id)
    whatsappHandler.handleConnection(socket)
    whatsappHandler.sendCurrentQRToSocket(socket)
  })

  socket.on('whatsapp:send-file', async (data) => {
    console.log('📤 Recebendo solicitação de envio de arquivo:', data)
    try {
      const { numero, arquivo, mensagem } = data
      
      if (!numero || !arquivo || !mensagem) {
        throw new Error('Dados incompletos para envio: numero, arquivo e mensagem são obrigatórios')
      }
      
      console.log(`📤 Processando envio: arquivo=${arquivo}, numero=${numero}`)
      await whatsappHandler.sendMessage(numero, mensagem, { filename: arquivo, mimetype: 'application/pdf' })
      console.log(`✅ Arquivo ${arquivo} enviado com sucesso para ${numero}`)
      socket.emit('whatsapp:file-sent', { numero })
    } catch (error) {
      console.error(`❌ Erro ao enviar arquivo para ${data?.numero}:`, error.message)
      socket.emit('whatsapp:file-error', { numero: data?.numero, error: error.message })
    }
  })
  
  socket.on('file:upload', (data) => {
    console.log('📁 Recebendo upload de arquivo:', data?.filename)
    fileHandler.handleFileUpload(socket, data)
  })

  socket.on('whatsapp:disconnect', () => {
    console.log('🔌 Solicitação de desconexão WhatsApp do socket:', socket.id)
    whatsappHandler.disconnect()
  })

  socket.on('whatsapp:force-reconnect', async () => {
    console.log('🔄 Solicitação de reconexão forçada via socket:', socket.id)
    try {
      await whatsappHandler.forceReconnect()
    } catch (error) {
      console.error('❌ Erro na reconexão forçada via socket:', error)
      socket.emit('whatsapp:status', { status: 'error', message: error.message })
    }
  })
  
  socket.on('disconnect', () => {
    console.log('🔌 Cliente desconectado:', socket.id)
    whatsappHandler.removeSocket(socket.id)
  })
})

// Iniciar servidor
const PORT = process.env.PORT || 5000
server.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`)
  console.log(`🌐 Frontend: http://localhost:3000`)
  console.log(`📡 Socket.IO configurado para CORS: http://localhost:3000`)
})
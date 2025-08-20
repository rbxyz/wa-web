const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, makeInMemoryStore, Browsers } = require('@whiskeysockets/baileys')
const Pino = require('pino')
const path = require('path')
const fs = require('fs/promises')

class WhatsAppHandler {
  constructor(io) {
    this.io = io
    this.sockets = new Map()
    this.sock = null
    this.isConnected = false
    this.authPath = path.join(__dirname, 'auth')
    this.reconnectAttempts = 0
    this.maxReconnectAttempts = 5
    this.reconnectInterval = null
    this.qrGenerated = false
    this.currentQR = null
    
    console.log('🔧 WhatsAppHandler inicializado')
    console.log('📁 Caminho de autenticação:', this.authPath)
  }

  async handleConnection(socket) {
    try {
      console.log('🔌 Iniciando conexão WhatsApp para socket:', socket.id)
      socket.emit('whatsapp:status', { status: 'connecting', message: 'Conectando ao WhatsApp...' })
      
      // Criar diretório de auth se não existir
      try {
        await fs.access(this.authPath)
      } catch {
        await fs.mkdir(this.authPath, { recursive: true })
        console.log('📁 Diretório de autenticação criado:', this.authPath)
      }

      const { state, saveCreds } = await useMultiFileAuthState(this.authPath)
      const { version } = await fetchLatestBaileysVersion()
      
      console.log('📱 Versão do Baileys:', version)

      const logger = Pino({ level: 'info' })
      
      // Criar store apenas se a função existir
      const store = makeInMemoryStore ? makeInMemoryStore({ logger }) : null
      
      this.sock = makeWASocket({
        version,
        logger,
        printQRInTerminal: false,
        auth: state,
        browser: Browsers.ubuntu('Chrome'),
        ...(store && { store }),
        // Configurações otimizadas
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 25000,
        retryRequestDelayMs: 2000,
        defaultQueryTimeoutMs: 60000,
        markOnlineOnConnect: false,
        syncFullHistory: false,
        generateHighQualityLinkPreview: false
      })

      // Configurar eventos principais
      this.setupSocketEvents(saveCreds)
      
      // Armazenar socket cliente
      this.sockets.set(socket.id, socket)
      console.log(`📝 Socket ${socket.id} registrado. Total de sockets: ${this.sockets.size}`)
      
    } catch (error) {
      console.error('❌ Erro ao conectar WhatsApp:', error)
      socket.emit('whatsapp:status', { 
        status: 'error', 
        message: `Erro na conexão: ${error.message}` 
      })
    }
  }

  setupSocketEvents(saveCreds) {
    console.log('⚙️ Configurando eventos do socket WhatsApp')

    // Evento principal de atualização de conexão
    this.sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr, isNewLogin } = update
      
      console.log('🔄 Connection update:', { 
        connection, 
        qr: qr ? `QR disponível (${qr.length} chars)` : 'Sem QR',
        isNewLogin 
      })
      
      // Processar QR Code
      if (qr && !this.qrGenerated) {
        console.log('📱 QR Code gerado - emitindo para todos os sockets')
        this.qrGenerated = true
        this.currentQR = qr
        this.broadcastToAllSockets('whatsapp:qr', { qr })
      }
      
      // Conexão estabelecida
      if (connection === 'open') {
        console.log('✅ WhatsApp conectado com sucesso!')
        this.isConnected = true
        this.reconnectAttempts = 0
        this.qrGenerated = false
        this.currentQR = null
        this.clearReconnectInterval()
        
        this.broadcastToAllSockets('whatsapp:status', { 
          status: 'connected', 
          message: 'WhatsApp conectado com sucesso!' 
        })
      }
      
      // Conexão fechada
      if (connection === 'close') {
        console.log('❌ WhatsApp desconectado')
        this.isConnected = false
        this.qrGenerated = false
        this.currentQR = null
        
        const reason = lastDisconnect?.error?.output?.payload?.error || 
                      lastDisconnect?.error?.data?.reason ||
                      'unknown'
        
        console.log('🔍 Motivo da desconexão:', reason)
        
        // Verificar se é erro de conflito/substituição
        const isConflictError = reason === 'conflict' || reason === 'replaced'
        const isLoggedOut = lastDisconnect?.error?.output?.statusCode === 401
        
        if (isConflictError) {
          console.log('⚠️ Erro de conflito detectado - limpando sessão')
          await this.clearOldSessions()
          this.broadcastToAllSockets('whatsapp:status', { 
            status: 'disconnected', 
            message: 'Conflito de sessão. Limpe as sessões e reconecte.' 
          })
          setTimeout(() => this.attemptReconnect(), 3000)
        } else if (isLoggedOut) {
          console.log('🔑 Sessão expirada - necessário novo QR Code')
          this.broadcastToAllSockets('whatsapp:status', { 
            status: 'disconnected', 
            message: 'Sessão expirada. Escaneie o QR Code novamente.' 
          })
        } else {
          // Tentar reconectar automaticamente
          this.reconnectAttempts++
          console.log(`🔄 Tentativa de reconexão ${this.reconnectAttempts}/${this.maxReconnectAttempts}`)
          
          if (this.reconnectAttempts <= this.maxReconnectAttempts) {
            this.broadcastToAllSockets('whatsapp:status', { 
              status: 'reconnecting', 
              message: `Tentativa de reconexão ${this.reconnectAttempts}/${this.maxReconnectAttempts}` 
            })
            this.scheduleReconnect()
          } else {
            this.broadcastToAllSockets('whatsapp:status', { 
              status: 'disconnected', 
              message: 'Limite de tentativas de reconexão excedido' 
            })
          }
        }
      }
    })

    // Salvar credenciais
    this.sock.ev.on('creds.update', saveCreds)

    // Tratar mensagens recebidas (para evitar logs de erro desnecessários)
    this.sock.ev.on('messages.upsert', async (m) => {
      // Log básico apenas para debug
      if (m.messages?.length > 0) {
        console.log(`📨 ${m.messages.length} mensagem(ns) processada(s)`)
      }
    })

    console.log('✅ Eventos do socket configurados')
  }

  scheduleReconnect() {
    this.clearReconnectInterval()
    
    console.log('⏰ Agendando reconexão em 5 segundos...')
    this.reconnectInterval = setTimeout(async () => {
      if (this.reconnectAttempts <= this.maxReconnectAttempts) {
        console.log('🔄 Executando reconexão automática...')
        try {
          if (this.sock) {
            this.sock.end()
            this.sock = null
          }
          await this.attemptReconnect()
        } catch (error) {
          console.error('❌ Erro na reconexão automática:', error)
        }
      }
    }, 5000)
  }

  clearReconnectInterval() {
    if (this.reconnectInterval) {
      clearTimeout(this.reconnectInterval)
      this.reconnectInterval = null
      console.log('⏰ Agendamento de reconexão cancelado')
    }
  }

  async attemptReconnect() {
    try {
      console.log('🔄 Iniciando tentativa de reconexão...')
      
      const { state, saveCreds } = await useMultiFileAuthState(this.authPath)
      const { version } = await fetchLatestBaileysVersion()
      
      const logger = Pino({ level: 'info' })
      const store = makeInMemoryStore ? makeInMemoryStore({ logger }) : null
      
      this.sock = makeWASocket({
        version,
        logger,
        printQRInTerminal: false,
        auth: state,
        browser: Browsers.ubuntu('Chrome'),
        ...(store && { store }),
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 25000,
        retryRequestDelayMs: 2000,
        defaultQueryTimeoutMs: 60000,
        markOnlineOnConnect: false,
        syncFullHistory: false,
        generateHighQualityLinkPreview: false
      })

      // Reconfigurar eventos para reconexão
      this.sock.ev.on('connection.update', async (update) => {
        const { connection, qr } = update
        
        if (qr && !this.qrGenerated) {
          console.log('📱 QR Code gerado na reconexão')
          this.qrGenerated = true
          this.currentQR = qr
          this.broadcastToAllSockets('whatsapp:qr', { qr })
        }
        
        if (connection === 'open') {
          console.log('✅ WhatsApp reconectado com sucesso!')
          this.isConnected = true
          this.reconnectAttempts = 0
          this.qrGenerated = false
          this.currentQR = null
          this.clearReconnectInterval()
          
          this.broadcastToAllSockets('whatsapp:status', { 
            status: 'connected', 
            message: 'WhatsApp reconectado com sucesso!' 
          })
        }
      })

      this.sock.ev.on('creds.update', saveCreds)
      
      console.log('✅ Reconexão configurada')
      
    } catch (error) {
      console.error('❌ Erro na tentativa de reconexão:', error)
      throw error
    }
  }

  sendCurrentQRToSocket(socket) {
    if (this.currentQR && this.qrGenerated) {
      console.log('📱 Enviando QR Code atual para novo socket:', socket.id)
      socket.emit('whatsapp:qr', { qr: this.currentQR })
    } else {
      console.log('📱 Nenhum QR Code disponível para enviar ao socket:', socket.id)
    }
  }
  
  broadcastToAllSockets(event, data) {
    console.log(`🔊 Emitindo evento '${event}' para ${this.sockets.size} socket(s)`)
    this.sockets.forEach((socket, id) => {
      try {
        socket.emit(event, data)
        console.log(`📡 Evento enviado para socket ${id}`)
      } catch (error) {
        console.error(`❌ Erro ao enviar evento para socket ${id}:`, error)
        this.sockets.delete(id)
      }
    })
  }

  async sendMessage(numero, mensagem, arquivo = null) {
    if (!this.sock || !this.isConnected) {
      throw new Error('WhatsApp não está conectado')
    }

    try {
      const jid = `${numero}@s.whatsapp.net`
      
      console.log(`📤 Preparando envio para ${jid}`)
      
      // Verificar se o número tem WhatsApp
      try {
        const [result] = await this.sock.onWhatsApp(jid)
        if (!result?.exists) {
          throw new Error(`Número ${numero} não possui WhatsApp`)
        }
        console.log(`✅ Número ${numero} verificado no WhatsApp`)
      } catch (verifyError) {
        console.log(`⚠️ Não foi possível verificar o número ${numero}, prosseguindo...`)
      }
      
      if (arquivo) {
        console.log(`📎 Enviando arquivo: ${arquivo.filename}`)
        
        const filePath = path.join(__dirname, 'uploads', arquivo.filename)
        console.log('📁 Caminho do arquivo:', filePath)
        
        try {
          const fileBuffer = await fs.readFile(filePath)
          console.log(`📊 Arquivo carregado: ${fileBuffer.length} bytes`)
          
          await this.sock.sendMessage(jid, {
            document: fileBuffer,
            mimetype: arquivo.mimetype || 'application/pdf',
            fileName: arquivo.filename,
            caption: mensagem
          })
          
          console.log(`✅ Arquivo ${arquivo.filename} enviado para ${numero}`)
        } catch (fileError) {
          console.error(`❌ Erro ao ler arquivo ${arquivo.filename}:`, fileError)
          throw new Error(`Arquivo ${arquivo.filename} não encontrado ou não pode ser lido`)
        }
      } else {
        console.log(`💬 Enviando mensagem de texto para ${numero}`)
        await this.sock.sendMessage(jid, { text: mensagem })
        console.log(`✅ Mensagem de texto enviada para ${numero}`)
      }
      
      return { success: true }
    } catch (error) {
      console.error(`❌ Erro ao enviar mensagem para ${numero}:`, error)
      throw error
    }
  }

  disconnect() {
    console.log('🔌 Desconectando WhatsApp...')
    this.clearReconnectInterval()
    
    if (this.sock) {
      this.sock.end()
      this.sock = null
    }
    
    this.isConnected = false
    this.qrGenerated = false
    this.currentQR = null
    
    this.broadcastToAllSockets('whatsapp:status', { 
      status: 'disconnected', 
      message: 'WhatsApp desconectado' 
    })
    
    console.log('✅ WhatsApp desconectado')
  }

  async clearOldSessions() {
    try {
      console.log('🗑️ Iniciando limpeza de sessões antigas...')
      
      try {
        const authFiles = await fs.readdir(this.authPath)
        let removedCount = 0
        
        for (const file of authFiles) {
          if (file.endsWith('.json')) {
            const filePath = path.join(this.authPath, file)
            await fs.unlink(filePath)
            console.log(`🗑️ Arquivo removido: ${file}`)
            removedCount++
          }
        }
        
        if (removedCount > 0) {
          console.log(`✅ ${removedCount} arquivo(s) de sessão removido(s)`)
        } else {
          console.log('ℹ️ Nenhum arquivo de sessão encontrado para remover')
        }
      } catch (dirError) {
        console.log('ℹ️ Diretório de auth não existe ou está vazio')
      }
      
    } catch (error) {
      console.error('❌ Erro ao limpar sessões:', error)
      throw error
    }
  }

  async forceReconnect() {
    console.log('🔄 Iniciando reconexão forçada...')
    
    this.reconnectAttempts = 0
    this.clearReconnectInterval()
    this.qrGenerated = false
    this.currentQR = null
    
    if (this.sock) {
      this.sock.end()
      this.sock = null
    }
    
    this.isConnected = false
    
    this.broadcastToAllSockets('whatsapp:status', { 
      status: 'connecting', 
      message: 'Forçando reconexão...' 
    })
    
    // Limpar sessões antigas antes de reconectar
    await this.clearOldSessions()
    
    // Tentar reconectar imediatamente
    await this.attemptReconnect()
    
    console.log('✅ Reconexão forçada iniciada')
  }

  removeSocket(socketId) {
    if (this.sockets.has(socketId)) {
      this.sockets.delete(socketId)
      console.log(`🗑️ Socket ${socketId} removido. Total restante: ${this.sockets.size}`)
    }
  }
}

module.exports = WhatsAppHandler
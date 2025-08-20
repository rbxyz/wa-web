import React, { useState, useEffect } from 'react'
import './WhatsAppConnection.css'
import QRCodeDisplay from './QRCode.jsx'

const WhatsAppConnection = ({ socket, status, onStatusChange }) => {  const [qrCode, setQrCode] = useState(null)
  const [isConnecting, setIsConnecting] = useState(false)
  // eslint-disable-next-line no-unused-vars
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!socket) return

    // Eventos do Socket.IO
    socket.on('whatsapp:status', (data) => {
      console.log(' Status recebido:', data)
      onStatusChange(data.status)
      setMessage(data.message)
      
      if (data.status === 'connected') {
        setIsConnecting(false)
        setQrCode(null) // Limpar QR Code quando conectar
      } else if (data.status === 'connecting' || data.status === 'reconnecting') {
        setIsConnecting(true)
      } else if (data.status === 'disconnected') {
        setIsConnecting(false)
        // NÃO limpar QR Code quando desconectar - pode precisar dele
        // setQrCode(null)
      }
    })

    socket.on('whatsapp:qr', (data) => {
      console.log('📱 QR Code recebido:', data)
      console.log('📱 QR Code string:', data.qr)
      console.log('📱 QR Code length:', data.qr ? data.qr.length : 'null')
      setQrCode(data.qr)
      setIsConnecting(false)
    })

    return () => {
      socket.off('whatsapp:status')
      socket.off('whatsapp:qr')
    }
  }, [socket, onStatusChange])

  // Debug: mostrar estado atual
  useEffect(() => {
    console.log('🔍 Estado atual - QR Code:', qrCode ? 'Disponível' : 'Não disponível')
    console.log('🔍 Estado atual - Status:', status)
  }, [qrCode, status])

  const handleConnect = () => {
    if (!socket) return
    
    console.log('🔌 Iniciando conexão...')
    setIsConnecting(true)
    setQrCode(null) // Limpar QR Code anterior
    socket.emit('whatsapp:connect')
  }

  const handleDisconnect = () => {
    if (!socket) return
    
    console.log('🔌 Desconectando...')
    socket.emit('whatsapp:disconnect')
    setIsConnecting(false)
    setQrCode(null)
  }

  const handleForceReconnect = () => {
    if (!socket) return
    
    console.log(' Forçando reconexão...')
    setIsConnecting(true)
    setQrCode(null)
    socket.emit('whatsapp:force-reconnect')
  }

  const handleClearSessions = async () => {
    try {
      console.log('🗑️ Limpando sessões...')
      const response = await fetch('/api/clear-sessions', {
        method: 'POST'
      })
      
      if (response.ok) {
        alert('Sessões antigas removidas. Tente conectar novamente.')
        setQrCode(null)
        onStatusChange('disconnected')
      } else {
        alert('Erro ao limpar sessões')
      }
    } catch (error) {
      alert('Erro ao limpar sessões: ' + error.message)
    }
  }

  const getStatusColor = () => {
    switch (status) {
      case 'connected': return 'green'
      case 'connecting': return 'orange'
      case 'reconnecting': return 'orange'
      case 'disconnected': return 'red'
      case 'error': return 'red'
      default: return 'gray'
    }
  }

  const getStatusText = () => {
    switch (status) {
      case 'connected': return '✅ Conectado'
      case 'connecting': return '🔄 Conectando...'
      case 'reconnecting': return '🔄 Reconectando...'
      case 'disconnected': return '❌ Desconectado'
      case 'error': return '❌ Erro'
      default: return '⏸️ Aguardando'
    }
  }

  // Função para testar QR Code
  const testQRCode = () => {
    // QR Code de teste simples
    const testQR = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
    setQrCode(testQR)
    console.log('🧪 QR Code de teste definido')
  }

  return (
    <div className="whatsapp-connection">
      <h3> Conexão WhatsApp</h3>
      
      <div className="status-display">
        <span 
          className="status-indicator" 
          style={{ backgroundColor: getStatusColor() }}
        ></span>
        <span className="status-text">{getStatusText()}</span>
      </div>

      {message && (
        <div className="message-display">
          <p>{message}</p>
        </div>
      )}

      {/* Debug: mostrar informações do QR Code */}
      <div className="debug-info" style={{ fontSize: '12px', color: '#666', margin: '10px 0', padding: '10px', background: '#f8f9fa', borderRadius: '5px' }}>
        <p><strong>Debug:</strong></p>
        <p>QR Code = {qrCode ? 'SIM' : 'NÃO'}</p>
        <p>Status = {status}</p>
        <p>Conectando = {isConnecting ? 'SIM' : 'NÃO'}</p>
        {qrCode && (
          <p>QR Length = {qrCode.length}</p>
        )}
        <button onClick={testQRCode} style={{ padding: '5px 10px', fontSize: '12px' }}>
          🧪 Testar QR Code
        </button>
      </div>

      {qrCode && (
        <div className="qr-display">
          <h4> Escaneie o QR Code</h4>
          <div className="qr-code">
            <QRCodeDisplay qrCode={qrCode} />
          </div>
          <p className="qr-instructions">
            Abra o WhatsApp no seu celular e escaneie este código
          </p>
          <div className="qr-tips">
            <p><strong> Dicas:</strong></p>
            <ul>
              <li>Certifique-se de que o WhatsApp está aberto no celular</li>
              <li>Posicione a câmera sobre o QR Code</li>
              <li>Aguarde a confirmação de conexão</li>
            </ul>
          </div>
        </div>
      )}
      <div className="connection-actions">
        {status === 'disconnected' || status === 'error' ? (
          <button
            onClick={handleConnect}
            disabled={isConnecting}
            className="btn btn-primary"
          >
            {isConnecting ? ' Conectando...' : '🔌 Conectar WhatsApp'}
          </button>
        ) : (
          <button
            onClick={handleDisconnect}
            className="btn btn-secondary"
          >
            🔌 Desconectar
          </button>
        )}
        
        {status === 'connected' && (
          <button
            onClick={handleForceReconnect}
            className="btn btn-info"
            title="Forçar reconexão"
          >
            🔄 Reconectar
          </button>
        )}
        
        <button
          onClick={handleClearSessions}
          className="btn btn-warning"
          title="Limpar sessões antigas para resolver conflitos"
        >
          🗑️ Limpar Sessões
        </button>
      </div>

      <div className="connection-info">
        <p><strong>Status:</strong> {getStatusText()}</p>
        {status === 'connected' && (
          <p><strong>Conectado como:</strong> Usuário WhatsApp</p>
        )}
        {status === 'reconnecting' && (
          <p><strong>Tentativas:</strong> Reconectando automaticamente...</p>
        )}
        {status === 'disconnected' && qrCode && (
          <p><strong>QR Code:</strong> Disponível para escaneamento</p>
        )}
      </div>
    </div>
  )
}

export default WhatsAppConnection

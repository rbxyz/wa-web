import React from 'react'

const Status = ({ status }) => {
  const getStatusInfo = () => {
    switch (status) {
      case 'connected':
        return { icon: '✅', text: 'Conectado ao WhatsApp', color: 'success' }
      case 'connecting':
        return { icon: '⏳', text: 'Conectando...', color: 'warning' }
      case 'qr_ready':
        return { icon: '📱', text: 'QR Code disponível', color: 'info' }
      case 'disconnected':
        return { icon: '❌', text: 'Desconectado', color: 'danger' }
      case 'error':
        return { icon: '⚠️', text: 'Erro na conexão', color: 'danger' }
      default:
        return { icon: '❓', text: 'Status desconhecido', color: 'secondary' }
    }
  }

  const statusInfo = getStatusInfo()

  return (
    <div className={`status-banner ${statusInfo.color}`}>
      <span className="status-icon">{statusInfo.icon}</span>
      <span className="status-text">{statusInfo.text}</span>
    </div>
  )
}

export default Status

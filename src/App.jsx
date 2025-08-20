import React, { useState, useEffect, useRef } from 'react'
import io from 'socket.io-client'
import WhatsAppConnection from './components/WhatsAppConnection.jsx'
import FileUpload from './components/FileUpload.jsx'
import BulkSender from './components/BulkSender.jsx'
import Status from './components/Status.jsx'
import './App.css'

function App() {
  const [socket, setSocket] = useState(null)
  const [whatsappStatus, setWhatsappStatus] = useState('disconnected')
  const [processedFiles, setProcessedFiles] = useState([])
  const [statusMessage, setStatusMessage] = useState('Aguardando conexão...')
  
  const socketRef = useRef(null)
  const initializedRef = useRef(false)

  useEffect(() => {
    if (initializedRef.current) return
    initializedRef.current = true

    // Conectar ao servidor Socket.IO
    const newSocket = io('http://localhost:5000')
    socketRef.current = newSocket
    setSocket(newSocket)
    window.socket = newSocket

    // Eventos do Socket.IO
    const onStatus = (data) => {
      setWhatsappStatus(data.status)
      setStatusMessage(data.message)
    }
    const onQr = () => {
      setStatusMessage('QR Code gerado - escaneie com o WhatsApp')
    }
    const onFileSent = (data) => {
      setStatusMessage(`✅ Arquivo enviado para ${data.numero}`)
    }
    const onFileError = (data) => {
      setStatusMessage(`❌ Erro ao enviar para ${data.numero}: ${data.error}`)
    }

    newSocket.on('whatsapp:status', onStatus)
    newSocket.on('whatsapp:qr', onQr)
    newSocket.on('whatsapp:file-sent', onFileSent)
    newSocket.on('whatsapp:file-error', onFileError)

    const handleUnload = () => newSocket.close()
    window.addEventListener('beforeunload', handleUnload)

    return () => {
      window.removeEventListener('beforeunload', handleUnload)
      // Não fecha o socket aqui para evitar desconexões pelo StrictMode
      newSocket.off('whatsapp:status', onStatus)
      newSocket.off('whatsapp:qr', onQr)
      newSocket.off('whatsapp:file-sent', onFileSent)
      newSocket.off('whatsapp:file-error', onFileError)
    }
  }, [])

  const handleFilesProcessed = (files) => {
    setProcessedFiles(files)
    setStatusMessage(`✅ ${files.length} arquivos processados`)
  }

  const handleStatusUpdate = (message) => {
    setStatusMessage(message)
  }

  const handleSendComplete = () => {
    setProcessedFiles([])
    setStatusMessage('✅ Envio em massa concluído!')
  }

  return (
    <div className="App">
      <header className="App-header">
        <h1>�� Wa - Web Sender</h1>
        <p>Envio em massa de arquivos via WhatsApp Web</p>
      </header>

      <main className="App-main">
        <div className="left-panel">
          <WhatsAppConnection 
            socket={socket}
            status={whatsappStatus}
            onStatusUpdate={handleStatusUpdate}
            onStatusChange={setWhatsappStatus}
          />
          
          <Status 
            status={whatsappStatus}
            message={statusMessage}
          />
        </div>

        <div className="right-panel">
          <FileUpload 
            onFilesProcessed={handleFilesProcessed}
            onStatusUpdate={handleStatusUpdate}
          />
          
          <BulkSender 
            socket={socket}
            processedFiles={processedFiles}
            onStatusUpdate={handleStatusUpdate}
            onSendComplete={handleSendComplete}
          />
        </div>
      </main>
    </div>
  )
}

export default App
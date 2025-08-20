import React, { useState, useEffect, useRef } from 'react'

const BulkSender = ({ socket, processedFiles, onStatusUpdate, onSendComplete }) => {
  const [phoneNumbers, setPhoneNumbers] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [progress, setProgress] = useState(0)
  const [customMessage, setCustomMessage] = useState('Olá! Aqui está seu documento.')
  const [sendResults, setSendResults] = useState([])
  const [currentSending, setCurrentSending] = useState(null)
  const [countdown, setCountdown] = useState(0)
  const countdownRef = useRef(null)

  // Timeout fixo de x segundos entre envios
  const SEND_DELAY_SECONDS = 120

  const startCountdown = (seconds) => {
    setCountdown(seconds)
    if (countdownRef.current) {
      clearInterval(countdownRef.current)
    }
    
    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(countdownRef.current)
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  const stopCountdown = () => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current)
      countdownRef.current = null
    }
    setCountdown(0)
  }

  const startSending = async () => {
    if (phoneNumbers.length === 0) {
      onStatusUpdate('❌ Nenhum número para enviar')
      return
    }

    setIsSending(true)
    setProgress(0)
    setSendResults([])
    setCurrentSending(null)
    onStatusUpdate('🚀 Iniciando envio em massa...')

    try {
      const total = phoneNumbers.length
      const results = []

      const readFileAsBase64 = (file) =>
        new Promise((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => {
            const base64 = String(reader.result).split(',')[1]
            resolve(base64)
          }
          reader.onerror = reject
          reader.readAsDataURL(file)
        })

      for (let i = 0; i < total; i++) {
        const phoneData = phoneNumbers[i]
        const fileData = processedFiles.find(f => f.code === phoneData.code)

        if (fileData) {
          if (!socket) {
            onStatusUpdate('❌ Socket não conectado')
            break
          }

          // Atualizar quem está sendo enviado atualmente
          setCurrentSending({
            telefone: phoneData.telefone,
            nome: phoneData.nome,
            codigo: phoneData.code,
            index: i + 1,
            total: total
          })

          // 1) Upload do arquivo para o servidor (se houver arquivo local)
          if (fileData.file) {
            onStatusUpdate(`📤 Fazendo upload de ${fileData.filename}...`)
            const base64 = await readFileAsBase64(fileData.file)
            
            const uploadOk = await new Promise((resolve) => {
              const timeout = setTimeout(() => resolve(false), 30000) // 30s timeout
              
              const onUploaded = (res) => {
                if (res.filename === fileData.filename) {
                  clearTimeout(timeout)
                  socket.off('file:uploaded', onUploaded)
                  resolve(res.success)
                }
              }
              
              socket.on('file:uploaded', onUploaded)
              socket.emit('file:upload', {
                filename: fileData.filename,
                content: base64,
                type: fileData.file.type || 'application/pdf'
              })
            })
            
            if (!uploadOk) {
              const errorResult = {
                telefone: phoneData.telefone,
                nome: phoneData.nome,
                codigo: phoneData.code,
                status: 'erro',
                erro: 'Falha no upload do arquivo',
                timestamp: new Date().toLocaleTimeString()
              }
              results.push(errorResult)
              setSendResults([...results])
              onStatusUpdate(`❌ Falha no upload de ${fileData.filename}`)
              continue
            }
          }

          // 2) Preparar mensagem personalizada
          const finalMessage = customMessage.includes('{codigo}') 
            ? customMessage.replace('{codigo}', phoneData.code)
            : `${customMessage} (Código: ${phoneData.code})`

          // 3) Solicitar envio pelo WhatsApp com Promise para aguardar resposta
          const sendResult = await new Promise((resolve) => {
            const timeout = setTimeout(() => {
              resolve({ success: false, error: 'Timeout no envio' })
            }, 45000) // 45s timeout
            
            const onFileSent = (data) => {
              if (data.numero === phoneData.telefone) {
                clearTimeout(timeout)
                socket.off('whatsapp:file-sent', onFileSent)
                socket.off('whatsapp:file-error', onFileError)
                resolve({ success: true })
              }
            }
            
            const onFileError = (data) => {
              if (data.numero === phoneData.telefone) {
                clearTimeout(timeout)
                socket.off('whatsapp:file-sent', onFileSent)
                socket.off('whatsapp:file-error', onFileError)
                resolve({ success: false, error: data.error })
              }
            }
            
            socket.on('whatsapp:file-sent', onFileSent)
            socket.on('whatsapp:file-error', onFileError)
            
            socket.emit('whatsapp:send-file', {
              numero: phoneData.telefone,
              arquivo: fileData.filename,
              mensagem: finalMessage
            })
          })

          // 4) Registrar resultado
          const result = {
            telefone: phoneData.telefone,
            nome: phoneData.nome,
            codigo: phoneData.code,
            status: sendResult.success ? 'sucesso' : 'erro',
            erro: sendResult.error || null,
            timestamp: new Date().toLocaleTimeString()
          }
          
          results.push(result)
          setSendResults([...results])
          
          if (sendResult.success) {
            onStatusUpdate(`✅ Enviado para ${phoneData.telefone} (${i + 1}/${total})`)
          } else {
            onStatusUpdate(`❌ Erro ao enviar para ${phoneData.telefone}: ${sendResult.error}`)
          }

          // 5) Aguardar delay entre envios (exceto no último)
          if (i < total - 1) {
            onStatusUpdate(`⏱️ Próximo envio em ${SEND_DELAY_SECONDS}s...`)
            startCountdown(SEND_DELAY_SECONDS)
            await new Promise(resolve => setTimeout(resolve, SEND_DELAY_SECONDS * 1000))
            stopCountdown()
          }

          setProgress(((i + 1) / total) * 100)
        }
      }

      setCurrentSending(null)
      const successCount = results.filter(r => r.status === 'sucesso').length
      const errorCount = results.filter(r => r.status === 'erro').length
      
      onStatusUpdate(`✅ Envio concluído! ${successCount} sucessos, ${errorCount} erros`)
      onSendComplete()
      
    } catch (error) {
      onStatusUpdate(`❌ Erro no envio: ${error.message}`)
      setCurrentSending(null)
      stopCountdown()
    } finally {
      setIsSending(false)
      setProgress(0)
      stopCountdown()
    }
  }

  const fetchPhoneNumbers = async () => {
    if (processedFiles.length === 0) return

    setIsLoading(true)
    onStatusUpdate('🔍 Buscando números de telefone...')

    try {
      const codes = processedFiles.map(file => file.code)
      const response = await fetch('/api/phone-numbers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codes })
      })

      if (!response.ok) throw new Error('Erro ao buscar números')

      const data = await response.json()
      setPhoneNumbers(data.phoneNumbers || [])
      onStatusUpdate(`✅ Encontrados ${data.phoneNumbers?.length || 0} números de telefone`)
    } catch (error) {
      onStatusUpdate(`❌ Erro ao buscar números: ${error.message}`)
    } finally {
      setIsLoading(false)
    }
  }

  // Buscar números de telefone quando arquivos são processados
  useEffect(() => {
    if (processedFiles.length > 0) {
      fetchPhoneNumbers()
    } else {
      setPhoneNumbers([])
      setSendResults([])
      setCurrentSending(null)
    }
  }, [processedFiles])

  // REMOVIDO: O useEffect que iniciava envio automático

  const handleMessageChange = (e) => {
    setCustomMessage(e.target.value)
  }

  // Cleanup do countdown quando componente desmonta
  useEffect(() => {
    return () => {
      if (countdownRef.current) {
        clearInterval(countdownRef.current)
      }
    }
  }, [])

  if (processedFiles.length === 0) {
    return null
  }

  return (
    <div className="bulk-sender">
      <h3>🚀 Envio em Massa</h3>
      
      {/* Campo de mensagem sempre visível */}
      <div className="config-section">
        <div className="message-config">
          <label>
            💬 Mensagem personalizada:
            <textarea
              value={customMessage}
              onChange={handleMessageChange}
              className="message-input"
              placeholder="Digite sua mensagem personalizada aqui..."
              rows="3"
              disabled={isSending}
            />
          </label>
          <div className="message-help">
            <p><strong>💡 Dica:</strong> Use <code>{'{codigo}'}</code> para incluir o código do arquivo na mensagem.</p>
            <p><strong>⏱️ Intervalo:</strong> {SEND_DELAY_SECONDS} segundos entre cada envio</p>
          </div>
        </div>

        {/* Preview da mensagem */}
        <div className="send-preview">
          <h4>📋 Preview da mensagem:</h4>
          <div className="message-preview">
            {customMessage.includes('{codigo}') 
              ? customMessage.replace('{codigo}', '[CÓDIGO]')
              : `${customMessage} (Código: [CÓDIGO])`
            }
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="loading">
          🔍 Buscando números de telefone...
        </div>
      ) : phoneNumbers.length > 0 ? (
        <div className="phone-numbers">
          <h4>📱 Números encontrados ({phoneNumbers.length}):</h4>
          <ul>
            {phoneNumbers.map((phone, index) => (
              <li key={index}>
                📞 {phone.telefone} - {phone.nome} (Código: {phone.code})
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="no-numbers">
          ❌ Nenhum número encontrado para os códigos
        </div>
      )}

      {/* Botão de iniciar envio - sempre visível quando há números */}
      {phoneNumbers.length > 0 && (
        <div className="send-section">
          <button
            onClick={startSending}
            disabled={isSending}
            className="btn btn-success"
          >
            {isSending ? '📤 Enviando...' : '🚀 Iniciar Envio em Massa'}
          </button>
        </div>
      )}

      {/* Status do envio atual */}
      {currentSending && (
        <div className="current-sending">
          <h4>📤 Enviando agora:</h4>
          <div className="sending-info">
            <p><strong>📞 Número:</strong> {currentSending.telefone}</p>
            <p><strong>👤 Nome:</strong> {currentSending.nome}</p>
            <p><strong>🔖 Código:</strong> {currentSending.codigo}</p>
            <p><strong>📊 Progresso:</strong> {currentSending.index}/{currentSending.total}</p>
          </div>
        </div>
      )}

      {/* Countdown */}
      {countdown > 0 && (
        <div className="countdown">
          <h4>⏱️ Próximo envio em: <span className="countdown-timer">{countdown}s</span></h4>
        </div>
      )}

      {/* Barra de progresso */}
      {isSending && (
        <div className="progress">
          <div className="progress-bar">
            <div 
              className="progress-fill" 
              style={{ width: `${progress}%` }}
            ></div>
          </div>
          <span>{Math.round(progress)}%</span>
        </div>
      )}

      {/* Resultados dos envios */}
      {sendResults.length > 0 && (
        <div className="send-results">
          <h4>📊 Resultados dos envios:</h4>
          <div className="results-list">
            {sendResults.map((result, index) => (
              <div key={index} className={`result-item ${result.status}`}>
                <div className="result-info">
                  <span className="result-icon">
                    {result.status === 'sucesso' ? '✅' : '❌'}
                  </span>
                  <span className="result-phone">{result.telefone}</span>
                  <span className="result-name">({result.nome})</span>
                  <span className="result-code">Código: {result.codigo}</span>
                  <span className="result-time">{result.timestamp}</span>
                </div>
                {result.erro && (
                  <div className="result-error">
                    {result.erro}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default BulkSender
import React, { useState, useEffect, useRef } from 'react'

const BulkSender = ({ socket, processedFiles, onStatusUpdate, onSendComplete }) => {
  const [phoneNumbers, setPhoneNumbers] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [progress, setProgress] = useState(0)
  const [delaySec, setDelaySec] = useState(20) // 20 segundos por padrão
  const startedRef = useRef(false)

  const startSending = async () => {
    if (phoneNumbers.length === 0) {
      onStatusUpdate('❌ Nenhum número para enviar')
      return
    }

    setIsSending(true)
    setProgress(0)
    onStatusUpdate(' Iniciando envio em massa...')

    try {
      const total = phoneNumbers.length

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

          // 1) Upload do arquivo para o servidor (se houver arquivo local)
          if (fileData.file) {
            const base64 = await readFileAsBase64(fileData.file)
            const uploadOk = await new Promise((resolve) => {
              const onUploaded = (res) => {
                if (res.filename === fileData.filename) {
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
              onStatusUpdate(`❌ Falha no upload de ${fileData.filename}`)
              continue
            }
          }

          // 2) Solicitar envio pelo WhatsApp
          socket.emit('whatsapp:send-file', {
            numero: phoneData.telefone,
            arquivo: fileData.filename,
            mensagem: `Olá! Aqui está seu documento: ${phoneData.code}`
          })

          onStatusUpdate(`📤 Enviando para ${phoneData.telefone} (${i + 1}/${total})`)

          // Aguardar timeout configurado entre envios
          if (i < total - 1) {
            await new Promise(resolve => setTimeout(resolve, delaySec * 1000))
          }

          setProgress(((i + 1) / total) * 100)
        }
      }

      onStatusUpdate('✅ Envio em massa concluído!')
      onSendComplete()
    } catch (error) {
      onStatusUpdate(`❌ Erro no envio: ${error.message}`)
    } finally {
      setIsSending(false)
      setProgress(0)
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
      startedRef.current = false
    }
  }, [processedFiles])

  // Iniciar envio automaticamente após buscar números (1x), evitando duplicatas
  useEffect(() => {
    if (!isLoading && phoneNumbers.length > 0 && !isSending && !startedRef.current) {
      startedRef.current = true
      startSending()
    }
  }, [isLoading, phoneNumbers, isSending])

  const updateDelay = (newTimeout) => {
    setDelaySec(newTimeout)
    onStatusUpdate(`⏱️ Timeout configurado para ${newTimeout} segundos`)
  }

  if (processedFiles.length === 0) {
    return null
  }

  return (
    <div className="bulk-sender">
      <h3> Envio em Massa</h3>
      
      <div className="config-section">
        <label>
          ⏱️ Timeout entre envios (segundos):
          <input
            type="number"
            min="5"
            max="300"
            value={delaySec}
            onChange={(e) => updateDelay(parseInt(e.target.value))}
            className="timeout-input"
          />
        </label>
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
                 {phone.telefone} - {phone.nome} (Código: {phone.code})
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="no-numbers">
          ❌ Nenhum número encontrado para os códigos
        </div>
      )}

      {phoneNumbers.length > 0 && (
        <div className="send-section">
          <button
            onClick={startSending}
            disabled={isSending}
            className="btn btn-success"
          >
            {isSending ? ' Enviando...' : '📤 Iniciar Envio em Massa'}
          </button>

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
        </div>
      )}
    </div>
  )
}

export default BulkSender
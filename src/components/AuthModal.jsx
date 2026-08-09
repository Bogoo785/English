import { useEffect, useState } from 'react'

function AuthModal({ open, onClose, user, configured, syncStatus, lastSynced, onSignIn, onSignUp, onSignOut, onSync }) {
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!open) {
      setPassword('')
      setMessage('')
    }
  }, [open])

  if (!open) return null

  async function submit(event) {
    event.preventDefault()
    setLoading(true)
    setMessage('')
    const result = mode === 'signin'
      ? await onSignIn(email, password)
      : await onSignUp(email, password)
    setLoading(false)
    setMessage(result.message)
    if (result.ok && result.signedIn) onClose()
  }

  async function signOut() {
    setLoading(true)
    const result = await onSignOut()
    setLoading(false)
    setMessage(result.message)
  }

  const statusText = syncStatus === 'saving'
    ? '正在同步…'
    : syncStatus === 'synced'
      ? '雲端進度已同步'
      : syncStatus === 'error'
        ? '同步失敗，進度仍保存在本機'
        : '目前使用本機存檔'

  return (
    <div className="auth-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <button className="auth-close" onClick={onClose} aria-label="關閉">×</button>
        <div className="auth-mark">☁️</div>
        <h2 id="auth-title">{user ? '我的雲端帳號' : mode === 'signin' ? '登入 Wordshire' : '建立新帳號'}</h2>

        {!configured ? (
          <div className="auth-notice">
            <b>雲端功能尚未設定</b>
            <p>請依照專案內的 SUPABASE_SETUP.md 填入連線資料。現在仍會自動保存於這台裝置。</p>
          </div>
        ) : user ? (
          <div className="auth-account">
            <small>登入帳號</small>
            <strong>{user.email}</strong>
            <div className={`sync-state sync-${syncStatus}`}>{statusText}</div>
            {lastSynced && <p>最後同步：{lastSynced.toLocaleTimeString('zh-TW')}</p>}
            <button className="auth-primary" onClick={onSync} disabled={loading || syncStatus === 'saving'}>立即同步</button>
            <button className="auth-secondary" onClick={signOut} disabled={loading}>登出</button>
          </div>
        ) : (
          <>
            <form className="auth-form" onSubmit={submit}>
              <label>
                電子信箱
                <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" required />
              </label>
              <label>
                密碼
                <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="至少 6 個字元" minLength="6" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} required />
              </label>
              {message && <p className="auth-message">{message}</p>}
              <button className="auth-primary" disabled={loading}>{loading ? '處理中…' : mode === 'signin' ? '登入並同步' : '註冊帳號'}</button>
            </form>
            <button className="auth-switch" onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setMessage('') }}>
              {mode === 'signin' ? '還沒有帳號？立即註冊' : '已經有帳號？返回登入'}
            </button>
          </>
        )}

        {user && message && <p className="auth-message">{message}</p>}
        <p className="auth-footnote">雲端只保存遊戲進度；單字題庫由網站提供，不會存入你的帳號。</p>
      </section>
    </div>
  )
}

export default AuthModal

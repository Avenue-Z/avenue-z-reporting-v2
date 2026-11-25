import { GoogleAuth } from 'google-auth-library'

const auths = new Map<string, GoogleAuth>()

function getAuth(scopes: string[]): GoogleAuth {
  const key = [...scopes].sort().join(' ')
  let auth = auths.get(key)
  if (!auth) {
    const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
    if (!raw) throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_KEY')
    const credentials = JSON.parse(Buffer.from(raw, 'base64').toString('utf-8'))
    auth = new GoogleAuth({ credentials, scopes })
    auths.set(key, auth)
  }
  return auth
}

/** Service-account access token for the given scopes (GOOGLE_SERVICE_ACCOUNT_KEY is base64 JSON). */
export async function googleToken(scopes: string[]): Promise<string> {
  const token = await getAuth(scopes).getAccessToken()
  if (!token) throw new Error('Google returned no access token')
  return token
}

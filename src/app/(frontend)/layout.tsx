import React from 'react'
import './styles.css'

export const metadata = {
  description: 'A blank template using Payload in a Next.js app.',
  title: 'Payload Blank Template',
}

export default async function RootLayout(props: { children: React.ReactNode }) {
  const { children } = props

  return (
    <html lang="en" style={{ backgroundColor: 'rgb(20, 20, 20)', colorScheme: 'dark' }}>
      <body style={{ backgroundColor: 'rgb(20, 20, 20)', margin: 0 }}>
        <main>{children}</main>
      </body>
    </html>
  )
}

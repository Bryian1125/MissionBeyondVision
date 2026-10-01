import './globals.css'

export const metadata = {
  title: 'mission beyond vision',
  description: 'A space mission you fly with your ears.',
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}

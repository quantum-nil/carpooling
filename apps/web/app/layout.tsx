import './globals.css';

export const metadata = {
  title: 'Carpooling',
  description: 'Carpooling platform',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

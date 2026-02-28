import { RootProvider } from 'fumadocs-ui/provider/next';
import './global.css';
import { ClerkProvider } from '@clerk/nextjs';

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <ClerkProvider signInUrl="/sign-in" signUpUrl="/sign-up">
      <html lang="en" suppressHydrationWarning>
        <body className="flex flex-col min-h-screen">
          <RootProvider>{children}</RootProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}

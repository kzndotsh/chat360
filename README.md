# Chat360 - Real-time Voice Chat Application

A modern, real-time voice chat application built with Next.js, Agora RTC, and Supabase. Chat360 provides seamless voice communication with features like party chat, presence tracking, and real-time voice status updates.

## Features

- 🎙️ **Real-time Voice Chat**
  - High-quality audio streaming with Agora RTC
  - Echo cancellation, noise suppression, automatic gain control
  - Voice activity detection
  - Mute/unmute functionality

- 👥 **Party System**
  - Real-time user presence tracking
  - Party member list with status indicators
  - Voice status indicators (speaking/silent/muted)
  - User avatars and profiles

- 🔒 **Security**
  - Token-based voice channel access
  - Encrypted communication

- 🎮 **Modern UI/UX**
  - Responsive design with Tailwind CSS
  - Shadcn/ui components
  - Smooth animations with Framer Motion
  - Xbox-inspired interface elements
  - Real-time status updates

## Tech Stack

- **Frontend Framework**: Next.js 15
- **Voice Communication**: Agora RTC SDK
- **Backend & Auth**: Supabase
- **State Management**: Zustand
- **Styling**: Tailwind CSS
- **UI Components**: Radix UI
- **Type Safety**: TypeScript
- **Testing**: Vitest
- **Monitoring**: Sentry

## Prerequisites

- Node.js 18.x or higher
- npm 9.x or higher
- A Supabase account
- An Agora account with App ID and certificate

## Environment Setup

Create a `.env.local` file in the root directory with the following variables:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
NEXT_PUBLIC_AGORA_APP_ID=your_agora_app_id
AGORA_APP_CERTIFICATE=your_agora_certificate
```

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/chat360.git
   cd chat360
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run the development server:
   ```bash
   npm run dev
   ```

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run format` - Format code with Prettier
- `npm run typecheck` - Run TypeScript type checking
- `npm run test` - Run tests with Vitest
- `npm run check:all` - Run all checks (format, lint, typecheck, knip)

## Development Guidelines

- Follow TypeScript best practices
- Use React hooks for state management
- Write tests for critical functionality
- Follow the established project structure
- Use the provided UI components from the component library

## Project Structure

```
src/
├── components/         # React components
│   ├── features/      # Feature-specific components
│   ├── providers/     # Context providers
│   └── ui/           # Reusable UI components
├── lib/               # Utility functions and hooks
│   ├── api/          # API clients and utilities
│   ├── hooks/        # Custom React hooks
│   ├── stores/       # Zustand stores
│   ├── types/        # TypeScript types
│   └── utils/        # Utility functions
└── styles/           # Global styles and Tailwind config
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Agora.io for real-time voice capabilities
- Supabase for backend infrastructure
- The Next.js team for the amazing framework
- All contributors who have helped shape this project

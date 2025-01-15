# Chat360

A real-time party chat application with voice communication built using Next.js, Agora, and Supabase.

## Features

- Real-time voice chat using Agora RTC
- Party member management with presence indicators
- Profile customization
- Modern Xbox-inspired UI
- Voice activity detection
- Mute controls

## Tech Stack

- **Framework**: Next.js 15
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Components**: shadcn/ui
- **State Management**: Zustand
- **Real-time Communication**: Agora RTC
- **Database & Auth**: Supabase
- **Monitoring**: Sentry
- **Testing**: Vitest

## Project Structure

```
src/
├── app/                    # Next.js app router pages
├── components/
│   ├── features/          # Feature-specific components
│   │   ├── party/        # Party-related components
│   │   └── modals/       # Modal-related components
│   ├── ui/               # Reusable UI components
│   └── icons/            # Icon components
├── lib/
│   ├── api/              # API integrations
│   ├── config/           # Configuration
│   ├── hooks/            # Custom hooks
│   ├── stores/           # State management
│   └── utils/            # Utility functions
├── types/                # TypeScript types
├── styles/               # Global styles
├── server/              # Server-side code
└── tests/               # Test suites
```

## Getting Started

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Set up environment variables:
   ```bash
   cp .env.example .env
   ```
4. Configure your Agora and Supabase credentials in `.env`
5. Start the development server:
   ```bash
   npm run dev
   ```

## Environment Variables

- `NEXT_PUBLIC_AGORA_APP_ID`: Agora App ID
- `AGORA_APP_CERTIFICATE`: Agora App Certificate
- `NEXT_PUBLIC_SUPABASE_URL`: Supabase URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase Anon Key

## Development

- `npm run dev`: Start development server
- `npm run build`: Build for production
- `npm run test`: Run tests
- `npm run lint`: Run linting
- `npm run format`: Format code

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

MIT

# Wedding Gallery Application

## Overview

This is a Firebase-only wedding photo gallery application built with React, TypeScript, and Tailwind CSS. The app allows photographers to create private galleries for weddings and provides secure access to clients through password protection and security questions. It features photo uploads, guest interactions (likes, comments, voice memos), and a comprehensive admin dashboard.

## System Architecture

### Frontend Architecture
- **React 18** with TypeScript for type safety
- **Vite** as the build tool for fast development and optimized production builds
- **Tailwind CSS** with custom theming using an "October Mist" color palette
- **shadcn/ui** components for consistent UI design
- **React Router (wouter)** for client-side routing
- **TanStack Query** for state management and caching
- **Firebase SDK** for all backend operations

### Backend Architecture
- **Firebase-only architecture** - no Node.js/Express backend
- **Firestore** as the primary NoSQL database
- **Firebase Storage** for image and audio file storage
- **Firebase Authentication** for admin and user management
- **Real-time listeners** for live updates of likes, comments, and new content

### Authentication System
- **Admin authentication** via Firebase Auth with email/password
- **Guest authentication** with flexible options:
  - Firebase Auth registration for full features
  - localStorage-based simple auth for basic interactions
  - Unified auth dialog supporting both flows

## Key Components

### Gallery Management
- **Gallery Creation**: Admin can create galleries with metadata, cover images, and security settings
- **Access Control**: Password protection with optional security questions
- **Photo Management**: Batch upload with compression, deletion, and organization
- **Guest Uploads**: Authenticated users can contribute photos to galleries

### User Interactions
- **Like System**: Users can like photos with real-time updates
- **Comment System**: Threaded comments with admin moderation
- **Voice Memos**: Record and upload audio messages with unlock scheduling
- **Photo Contributions**: Guest photo uploads with proper attribution

### Admin Dashboard
- **Gallery Overview**: Statistics, recent activity, and management tools
- **User Management**: View registered users and their contributions
- **Subscription Management**: Track notification subscriptions
- **Content Moderation**: Manage comments, voice memos, and user uploads

## Data Flow

### Gallery Access Flow
1. User enters gallery code
2. System checks if gallery exists and access requirements
3. If password required, prompts for password
4. If security question enabled, validates answer
5. Grants access and loads gallery content with pagination

### Photo Management Flow
1. Admin uploads photos via batch upload interface
2. Images are compressed before storage
3. Metadata stored in Firestore with Firebase Storage URLs
4. Photos displayed with lazy loading and intersection observer
5. Guest uploads follow similar flow but with attribution

### Real-time Updates
- **Firestore listeners** for live comment updates
- **React Query** for cache invalidation and fresh data
- **Optimistic updates** for immediate UI feedback
- **Batch processing** for performance optimization

## External Dependencies

### Firebase Services
- **Firestore**: Database for galleries, photos, comments, likes, users
- **Storage**: File storage for images and audio
- **Auth**: User authentication and session management

### Third-party Libraries
- **shadcn/ui**: Pre-built accessible components
- **Radix UI**: Underlying component primitives
- **TanStack Query**: Server state management
- **date-fns**: Date manipulation and formatting
- **framer-motion**: Animation library
- **browser-image-compression**: Client-side image compression

### Media Handling
- **Image compression** before upload to optimize storage
- **WebAudio API** for voice memo recording
- **Intersection Observer** for lazy loading images
- **Image cache system** for performance optimization

## Deployment Strategy

### Build Configuration
- **Vite build** generates optimized static assets
- **TypeScript compilation** with strict type checking
- **Tailwind CSS** purging for minimal bundle size
- **Environment variables** for Firebase configuration

### Hosting Requirements
- **Static hosting** sufficient (no server required)
- **Base path configuration** for subdirectory deployment
- **Environment variables** for Firebase connection
- **HTTPS required** for Firebase Auth and media permissions

### Performance Optimizations
- **Code splitting** with React.lazy for route-based chunks
- **Image lazy loading** with intersection observer
- **Pagination** for large photo collections
- **Compression** for uploaded images
- **Caching strategies** for frequently accessed data

## Changelog

- July 07, 2025. Initial setup

## User Preferences

Preferred communication style: Simple, everyday language.
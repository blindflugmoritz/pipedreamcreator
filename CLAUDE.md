# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build/Run Commands
- Installation: `npm install && npm link`
- Run CLI: `pdmanager <command> [options]`
- Test: None defined, use manual testing
- Debug: Check logs in ./logs directory and screenshots

## Code Style Guidelines
- JavaScript with CommonJS module system (require/module.exports)
- camelCase for variables and functions
- Async/await pattern for asynchronous operations
- Proper error handling with try/catch blocks
- Detailed logging for debugging
- Puppeteer for browser automation
- Commander.js for CLI argument parsing
- Well-documented functions with clear parameter usage
- Modular design with separate command files
- Environment variables stored in .env file

## Project Structure
- commands/ - Individual CLI command implementations
- index.js - CLI entry point and command registration
- logs/ - Log files and debugging screenshots
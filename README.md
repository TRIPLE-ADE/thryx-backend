# Adaptive File Upload API

This project provides an Express.js server with an adaptive file upload endpoint. It automatically chooses between in-memory and disk storage for uploaded files based on system memory usage and file size, then uploads the file to the Google Gemini Files API.

## Features
- **Adaptive Storage:** Uses memory for small files and low memory usage, disk for large files or high memory pressure.
- **CORS Protection:** Only allows requests from trusted origins.
- **Performance Monitoring:** Logs request durations and upload details.
- **Automatic Cleanup:** Ensures temporary files are deleted after processing.

## Requirements
- Node.js (v16 or newer recommended)
- A Google Gemini API key

## Setup
1. **Clone the repository:**
   ```bash
   git clone <your-repo-url>
   cd <your-repo-directory>
   ```
2. **Install dependencies:**
   ```bash
   npm install
   ```
3. **Configure environment variables:**
   - Create a `.env` file in the root directory:
     ```env
     GOOGLE_API_KEY=your-google-gemini-api-key
     ```

## Usage
1. **Start the server:**
   ```bash
   npm start
   # or
   node app.js
   ```
2. **Upload a file:**
   - Send a `POST` request to `/upload` with a file in the `file` field (multipart/form-data).
   - Example using `curl`:
     ```bash
     curl -F "file=@/path/to/your/file.pdf" http://localhost:3000/upload
     ```
   - The server will respond with a JSON object containing the Gemini API upload result.

## Environment Variables
- `GOOGLE_API_KEY`: Your Google Gemini API key (required).

## Notes
- The server will automatically create an `uploads` directory if it does not exist.
- Files are deleted from disk after being uploaded to Gemini, regardless of storage type.
- CORS is restricted to a set of allowed origins (see `allowedOrigins` in `app.js`).

## License
MIT 
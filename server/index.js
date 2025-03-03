 // server/index.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const { spawn } = require('child_process');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(cors());
// Serve static files from outputs/ (for transcoded video, subtitles, thumbnail, etc.)
app.use('/outputs', express.static('outputs'));


// MongoDB connection
mongoose.connect('mongodb://localhost:27017/videoProcessing', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'MongoDB connection error:'));

//test
db.once('open', () => {
  console.log('Connected to MongoDB successfully!');
});

// Define a Job schema to track each processing job.
const jobSchema = new mongoose.Schema({
  videoPath: String,
  transcodedPath: String,
  subtitlesPath: String,
  segmentsPath: String,
  thumbnailPath: String,
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'error'],
    default: 'pending',
  },
  createdAt: { type: Date, default: Date.now },
});
const Job = mongoose.model('Job', jobSchema);

// Setup multer for file uploads
const upload = multer({ dest: 'uploads/' });

// =====================
// API Endpoints
// =====================

// POST endpoint to process a video.
// This endpoint accepts a video file upload and starts the processing pipeline.
app.post('/api/process-video', upload.single('video'), async (req, res) => {
  try {
    // Save the video file path from multer.
    const videoPath = req.file.path;

    // Create a job entry in MongoDB.
    const job = new Job({ videoPath, status: 'processing' });
    await job.save();

    // Process the video asynchronously.
    processVideo(job);

    // Return job info so the client can poll for status/results.
    res.json({ jobId: job._id });
  } catch (error) {
    console.error('Error in /api/process-video:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// GET endpoint to check job status/results.
app.get('/api/job/:jobId', async (req, res) => {
  try {
    const job = await Job.findById(req.params.jobId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    res.json(job);
  } catch (error) {
    console.error('Error in /api/job/:jobId:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// =====================
// Video Processing Pipeline
// =====================

async function processVideo(job) {
  try {
    const videoPath = job.videoPath;
    const baseName = path.parse(videoPath).name;
    const outputDir = 'outputs';
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir);
    }

    // 1. Video Transcoding using FFmpeg
    const transcodedPath = path.join(outputDir, `${baseName}-transcoded.mp4`);
    await transcodeVideo(videoPath, transcodedPath);
    job.transcodedPath = transcodedPath;
    await job.save();

    // 2. Subtitle Generation (using a Python script with OpenAI Whisper)
    const subtitlesPath = path.join(outputDir, `${baseName}-subtitles.srt`);
    await generateSubtitles(videoPath, subtitlesPath);
    job.subtitlesPath = subtitlesPath;
    await job.save();

    // 3. Segment Generation (using a Python script with PySceneDetect)
    const segmentsPath = path.join(outputDir, `${baseName}-segments.json`);
    await generateSegments(videoPath, segmentsPath);
    job.segmentsPath = segmentsPath;
    await job.save();

    // 4. Thumbnail Generation (extract a frame using FFmpeg)
    const thumbnailPath = path.join(outputDir, `${baseName}-thumbnail.jpg`);
    await generateThumbnail(videoPath, thumbnailPath);
    job.thumbnailPath = thumbnailPath;
    await job.save();

    job.status = 'completed';
    await job.save();
  } catch (error) {
    console.error('Error processing video:', error);
    job.status = 'error';
    await job.save();
  }
}

// Video Transcoding using fluent-ffmpeg
function transcodeVideo(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      // You can add more FFmpeg options here (codecs, bitrate, etc.)
      .output(outputPath)
      .on('end', () => {
        console.log('Video transcoding completed.');
        resolve();
      })
      .on('error', (err) => {
        console.error('Transcoding error:', err);
        reject(err);
      })
      .run();
  });
}

// Subtitle generation: call a Python script that uses Whisper.
// For subtitle generation:
function generateSubtitles(videoPath, outputSrtPath) {
  return new Promise((resolve, reject) => {
    // Use the virtual environment's python executable
    const processSub = spawn('./venv/bin/python', ['scripts/generate_subtitles.py', videoPath, outputSrtPath]);

    processSub.stdout.on('data', (data) => {
      console.log(`Subtitle generation: ${data}`);
    });

    processSub.stderr.on('data', (data) => {
      console.error(`Subtitle error: ${data}`);
    });

    processSub.on('close', (code) => {
      if (code === 0) {
        console.log('Subtitle generation completed.');
        resolve();
      } else {
        reject(new Error('Subtitle generation failed with code ' + code));
      }
    });
  });
}

// For segment generation:
function generateSegments(videoPath, outputJsonPath) {
  return new Promise((resolve, reject) => {
    const processSeg = spawn('./venv/bin/python', ['scripts/generate_segments.py', videoPath, outputJsonPath]);

    processSeg.stdout.on('data', (data) => {
      console.log(`Segment generation: ${data}`);
    });

    processSeg.stderr.on('data', (data) => {
      console.error(`Segment error: ${data}`);
    });

    processSeg.on('close', (code) => {
      if (code === 0) {
        console.log('Segment generation completed.');
        resolve();
      } else {
        reject(new Error('Segment generation failed with code ' + code));
      }
    });
  });
}

// Thumbnail generation using FFmpeg: extract a frame (say at 50% of video duration).
function generateThumbnail(videoPath, thumbnailPath) {
  return new Promise((resolve, reject) => {
    // First, get the video duration.
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) return reject(err);
      const duration = metadata.format.duration;
      const seekTime = duration / 2; // choose mid point for thumbnail
      ffmpeg(videoPath)
        .screenshots({
          timestamps: [seekTime],
          filename: path.basename(thumbnailPath),
          folder: path.dirname(thumbnailPath),
          size: '320x240',
        })
        .on('end', () => {
          console.log('Thumbnail generated.');
          resolve();
        })
        .on('error', (err) => {
          console.error('Thumbnail generation error:', err);
          reject(err);
        });
    });
  });
}

// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

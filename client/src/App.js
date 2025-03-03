
// client/src/App.js
import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import {
  Container,
  Row,
  Col,
  Form,
  Button,
  Card,
  ProgressBar,
  Alert,
  ListGroup,
} from 'react-bootstrap';
import 'bootstrap/dist/css/bootstrap.min.css';
import './App.css';

function VideoPlayer({ jobData }) {
  const videoRef = useRef(null);
  const [subtitleUrl, setSubtitleUrl] = useState(null);
  const [segments, setSegments] = useState([]);

  // Fetch and convert subtitles (SRT -> VTT)
  useEffect(() => {
    if (jobData && jobData.subtitlesPath) {
      fetch(`http://localhost:5000/${jobData.subtitlesPath}`)
        .then((res) => res.text())
        .then((text) => {
          let vttText = text;
          // Convert SRT timestamps (using commas) to VTT (using periods)
          vttText = vttText.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
          if (!vttText.startsWith('WEBVTT')) {
            vttText = 'WEBVTT\n\n' + vttText;
          }
          const blob = new Blob([vttText], { type: 'text/vtt' });
          const blobUrl = URL.createObjectURL(blob);
          setSubtitleUrl(blobUrl);
        })
        .catch((err) => console.error('Error fetching subtitles', err));
    }
  }, [jobData]);

  // Fetch segments JSON if available.
  useEffect(() => {
    if (jobData && jobData.segmentsPath) {
      fetch(`http://localhost:5000/${jobData.segmentsPath}`)
        .then((res) => res.json())
        .then((json) => setSegments(json))
        .catch((err) => console.error('Error fetching segments', err));
    }
  }, [jobData]);

  // Jump to a specific segment time.
  const jumpToSegment = (startTime) => {
    if (videoRef.current) {
      videoRef.current.currentTime = startTime;
      videoRef.current.play();
    }
  };

  return (
    <Card className="mt-4 bg-dark text-white border-0">
      <Card.Header className="bg-netflix text-white">
        <strong>Video Player</strong>
      </Card.Header>
      <Card.Body>
        <video
          ref={videoRef}
          width="100%"
          controls
          poster={`http://localhost:5000/${jobData.thumbnailPath}`}
        >
          <source
            src={`http://localhost:5000/${jobData.transcodedPath}`}
            type="video/mp4"
          />
          {subtitleUrl && (
            <track
              src={subtitleUrl}
              kind="subtitles"
              srcLang="en"
              label="English Subtitles"
              default
            />
          )}
          Your browser does not support the video tag.
        </video>
        <Row className="mt-3">
          <Col>
            <h5 className="text-netflix">Segments</h5>
            {segments.length > 0 ? (
              <ListGroup variant="flush">
                {segments.map((seg) => (
                  <ListGroup.Item
                    key={seg.scene}
                    action
                    onClick={() => jumpToSegment(seg.start)}
                    className="bg-dark text-white segment-item"
                  >
                    Scene {seg.scene}: {seg.start.toFixed(2)}s -{' '}
                    {seg.end.toFixed(2)}s
                  </ListGroup.Item>
                ))}
              </ListGroup>
            ) : (
              <p>No segments available.</p>
            )}
          </Col>
        </Row>
      </Card.Body>
    </Card>
  );
}

function App() {
  const [videoFile, setVideoFile] = useState(null);
  const [jobId, setJobId] = useState(null);
  const [jobData, setJobData] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState(null);

  const handleFileChange = (e) => {
    setVideoFile(e.target.files[0]);
    setJobData(null);
    setJobId(null);
    setError(null);
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!videoFile) {
      setError('Please select a video file.');
      return;
    }
    setUploading(true);
    const formData = new FormData();
    formData.append('video', videoFile);
    try {
      const response = await axios.post(
        'http://localhost:5000/api/process-video',
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      setJobId(response.data.jobId);
      setUploading(false);
      pollJob(response.data.jobId);
    } catch (err) {
      console.error(err);
      setError('Upload failed. Please try again.');
      setUploading(false);
    }
  };

  const pollJob = async (jobId) => {
    setPolling(true);
    const interval = setInterval(async () => {
      try {
        const res = await axios.get(`http://localhost:5000/api/job/${jobId}`);
        setJobData(res.data);
        if (res.data.status === 'completed' || res.data.status === 'error') {
          setPolling(false);
          clearInterval(interval);
        }
      } catch (err) {
        console.error(err);
        setError('Error polling job status.');
        setPolling(false);
        clearInterval(interval);
      }
    }, 3000);
  };

  return (
    <Container fluid className="app-container">
      <Row className="justify-content-center">
        <Col md={8}>
          <h2 className="text-center text-netflix my-4">
            VADER - Testing Interface
          </h2>
          {error && <Alert variant="danger">{error}</Alert>}
          <Card className="bg-dark text-white border-0">
            <Card.Body>
              <Form onSubmit={handleUpload}>
                <Form.Group controlId="formVideoUpload">
                  <Form.Label>Select a video file to process</Form.Label>
                  <Form.Control
                    type="file"
                    accept="video/*"
                    onChange={handleFileChange}
                    className="bg-secondary text-white"
                  />
                </Form.Group>
                <Button
                  className="btn-netflix mt-3"
                  type="submit"
                  disabled={uploading}
                >
                  {uploading ? 'Uploading...' : 'Upload and Process'}
                </Button>
              </Form>
            </Card.Body>
          </Card>
          {polling && (
            <div className="mt-3">
              <p className="text-center processing-text">Processing... Please wait.</p>
              <ProgressBar animated now={100} className="progress-netflix" />
            </div>
          )}
          {jobData && jobData.status === 'completed' && (
            <>
              <Card className="mt-4 bg-dark text-white border-0">
                <Card.Header className="bg-netflix">
                  <strong>Job Results</strong>
                </Card.Header>
                <Card.Body>
                  <p>
                    <strong>Transcoded Video:</strong>{' '}
                    <a
                      href={`http://localhost:5000/${jobData.transcodedPath}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="file-link"
                    >
                      View Video
                    </a>
                  </p>
                  <p>
                    <strong>Subtitles:</strong>{' '}
                    <a
                      href={`http://localhost:5000/${jobData.subtitlesPath}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="file-link"
                    >
                      Download Subtitles
                    </a>
                  </p>
                  <p>
                    <strong>Segments:</strong>{' '}
                    <a
                      href={`http://localhost:5000/${jobData.segmentsPath}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="file-link"
                    >
                      View Segments JSON
                    </a>
                  </p>
                  <p>
                    <strong>Thumbnail:</strong>{' '}
                    <a
                      href={`http://localhost:5000/${jobData.thumbnailPath}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="file-link"
                    >
                      View Thumbnail
                    </a>
                  </p>
                </Card.Body>
              </Card>
              <VideoPlayer jobData={jobData} />
            </>
          )}
        </Col>
      </Row>
    </Container>
  );
}

export default App;

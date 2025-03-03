# server/scripts/generate_subtitles.py
import sys
import whisper

def generate_subtitles(video_path, output_srt):
    # Load the model (you can choose tiny/base/small/medium/large)
    model = whisper.load_model("base")
    # Transcribe the audio from video
    result = model.transcribe(video_path)
    # Write to SRT file
    with open(output_srt, "w", encoding="utf-8") as f:
        index = 1
        for segment in result["segments"]:
            start = segment["start"]
            end = segment["end"]
            text = segment["text"].strip()
            # Convert seconds to hh:mm:ss,ms format
            def format_time(t):
                hours = int(t // 3600)
                minutes = int((t % 3600) // 60)
                seconds = int(t % 60)
                milliseconds = int((t - int(t)) * 1000)
                return f"{hours:02}:{minutes:02}:{seconds:02},{milliseconds:03}"
            f.write(f"{index}\n")
            f.write(f"{format_time(start)} --> {format_time(end)}\n")
            f.write(f"{text}\n\n")
            index += 1

if __name__ == '__main__':
    if len(sys.argv) != 3:
        print("Usage: python3 generate_subtitles.py <video_path> <output_srt>")
        sys.exit(1)
    video_path = sys.argv[1]
    output_srt = sys.argv[2]
    generate_subtitles(video_path, output_srt)

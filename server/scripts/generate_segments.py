# server/scripts/generate_segments.py
import sys
import os
import json
from scenedetect import open_video, SceneManager, ContentDetector

def generate_segments(video_path, output_json, threshold=30.0):
    if not os.path.exists(video_path):
        print(f"Error: Video file not found at '{video_path}'.")
        sys.exit(1)
    
    video = open_video(video_path)
    scene_manager = SceneManager()
    scene_manager.add_detector(ContentDetector(threshold=threshold))
    
    scene_manager.detect_scenes(video)
    scene_list = scene_manager.get_scene_list(video)
    print(f"Detected {len(scene_list)} scenes.")
    
    scenes = []
    for i, (start, end) in enumerate(scene_list):
        scenes.append({
            "scene": i + 1,
            "start": start.get_seconds(),
            "end": end.get_seconds()
        })
    
    with open(output_json, "w", encoding="utf-8") as f:
        json.dump(scenes, f, indent=2)
    print(f"Segments saved to {output_json}")

if __name__ == '__main__':
    if len(sys.argv) < 3:
        print("Usage: python3 generate_segments.py <video_path> <output_json> [threshold]")
        sys.exit(1)
    video_path = sys.argv[1]
    output_json = sys.argv[2]
    threshold = float(sys.argv[3]) if len(sys.argv) == 4 else 30.0
    generate_segments(video_path, output_json, threshold)



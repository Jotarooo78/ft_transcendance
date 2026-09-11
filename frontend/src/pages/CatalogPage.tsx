import { useState } from "react";

import AudioPlayer from "../components/AudioPlayer";
import TrackCard from "../components/TrackCard";
import { mockTracks } from "../data/tracks";
import type { Track } from "../types/music";

function CatalogPage() {
  const [selectedTrack, setSelectedTrack] = useState<Track | null>(null);

  function handlePlay(track: Track) {
    setSelectedTrack(track);
  }

  function handleClosePlayer() {
    setSelectedTrack(null);
  }

  return (
    <>
      <main className="catalog-page">
        <header>
          <p className="page-label">Discover</p>

          <h1>Music catalog</h1>

          <p>Explore independent tracks published by our community.</p>
        </header>

        <section className="catalog-section" aria-labelledby="catalog-title">
          <h2 id="catalog-title">Available tracks</h2>

          <div className="track-list">
            {mockTracks.map((track) => (
              <TrackCard
                key={track.id}
                track={track}
                isSelected={selectedTrack?.id === track.id}
                onPlay={handlePlay}
              />
            ))}
          </div>
        </section>
      </main>

      {selectedTrack && (
        <AudioPlayer track={selectedTrack} onClose={handleClosePlayer} />
      )}
    </>
  );
}

export default CatalogPage;

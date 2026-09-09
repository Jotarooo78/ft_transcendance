import TrackCard from "../components/TrackCard";
import { mockTracks } from "../data/tracks";

function CatalogPage() {
  return (
    <main className="catalog-page">
      <header>
        <p className="page-label">
          Discover
        </p>

        <h1>Music catalog</h1>

        <p>
          Explore independent tracks published by
          our community.
        </p>
      </header>

      <section
        className="catalog-section"
        aria-labelledby="catalog-title"
      >
        <h2 id="catalog-title">
          Available tracks
        </h2>

        <div className="track-list">
          {mockTracks.map((track) => (
            <TrackCard
              key={track.id}
              track={track}
            />
          ))}
        </div>
      </section>
    </main>
  );
}

export default CatalogPage;
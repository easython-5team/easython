export default function Notice({ notice }) {
  return (
    <div className="notice" lang="en">
      <div className="notice-section">
        <h3>Work update</h3>
        <p>{notice.summary}</p>
      </div>
      <div className="notice-section question">
        <h3>Situation question</h3>
        <p>{notice.question}</p>
      </div>
    </div>
  );
}

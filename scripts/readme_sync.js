function parseLatestReadmeNotes(readme) {
    let re = /### (\d.\d.\d) \((.*)\)/;

    const parts = readme.split('<summary>Expand to see all version notes</summary>');
    const notes = parts[1] || readme;
    const collectedNotes = [];
    let headerCount = 0;

    const latestReleaseNotes = notes.split('\n').filter(line => {
        if (line.includes('###')) {
            headerCount++;
        }
        if (line.length < 2) {
            return false;
        }
        return headerCount < 4;
    }).map(line => line.trim());

    let currentVersion = null;
    for (let line of latestReleaseNotes) {
        const match = line.match(re);
        if (match) {
            currentVersion && collectedNotes.push(currentVersion);
            currentVersion = {};
            currentVersion.version = match[1];
            currentVersion.date = match[2];
            currentVersion.notes = [];
        } else if (currentVersion) {
            currentVersion.notes.push(line.replace('- ', ''));
        }
    }

    if (currentVersion) {
        collectedNotes.push(currentVersion);
    }
    return collectedNotes;
}

module.exports = {
    parseLatestReadmeNotes,
};

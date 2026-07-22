const csvPaths = [
    "../spotify-data-visualization/dataset/Most_Streamed_Spotify_Songs_2023_Cleaned.csv",
    "../spotify-data-visualization/dataset/spotify-2023.csv",
    "Most_Streamed_Spotify_Songs_2023_Cleaned.csv",
];

const parseDate = d3.timeParse("%Y-%m-%d");
const formatNumber = d3.format(",");
const formatCompact = d3.format(".2s");

const palette = {
    green: "#1DB954",
    greenHover: "#22d862",
    accent: "#1ea7a3",
    muted: "#B3B3B3",
};

const tooltip = d3.select("#tooltip");
const state = {
    search: "",
    year: "All",
    platform: "All",
    cluster: "All",
    artist: "All",
    scatterMetric: "danceability",
};

let allRows = [];

// Accessible Tooltip Handlers
function showTooltip(event, title, html) {
    tooltip
        .style("display", "block")
        .style("left", `${event.clientX}px`)
        .style("top", `${event.clientY}px`)
        .attr("aria-hidden", "false")
        .html(`<div class="title">${title}</div><div class="meta">${html}</div>`);
}

function moveTooltip(event) {
    tooltip.style("left", `${event.clientX}px`).style("top", `${event.clientY}px`);
}

function hideTooltip() {
    tooltip.style("display", "none").attr("aria-hidden", "true");
}

function classifyCluster(d) {
    if (d.acousticness >= 70) return "Acoustic";
    if (d.energy >= 75 && d.danceability >= 70) return "Dance";
    if (d.valence >= 70 && d.energy >= 60) return "Pop";
    if (d.instrumentalness >= 20) return "Instrumental";
    if (d.speechiness >= 12) return "Vocal";
    return "Chill";
}

function normalizeRow(row) {
    const releasedAt = parseDate(`${row.released_year}-${String(row.released_month).padStart(2, "0")}-${String(row.released_day).padStart(2, "0")}`);
    const artistNames = (row["artist(s)_name"] || "").split(/,\s*/).map(name => name.trim()).filter(Boolean);

    return {
        track_name: row.track_name,
        artist_name: row["artist(s)_name"],
        artistNames,
        releasedAt,
        released_year: +row.released_year,
        streams: +row.streams,
        spotifyPlaylists: +row.in_spotify_playlists,
        applePlaylists: +row.in_apple_playlists,
        deezerPlaylists: +row.in_deezer_playlists,
        bpm: +row.bpm,
        danceability: +row["danceability_%"],
        valence: +row["valence_%"],
        energy: +row["energy_%"],
        acousticness: +row["acousticness_%"],
        instrumentalness: +row["instrumentalness_%"],
        speechiness: +row["speechiness_%"],
        cluster: classifyCluster({
            acousticness: +row["acousticness_%"],
            energy: +row["energy_%"],
            danceability: +row["danceability_%"],
            valence: +row["valence_%"],
            instrumentalness: +row["instrumentalness_%"],
            speechiness: +row["speechiness_%"],
        }),
    };
}

function platformField(platform) {
    if (platform === "Spotify") return "spotifyPlaylists";
    if (platform === "Apple") return "applePlaylists";
    if (platform === "Deezer") return "deezerPlaylists";
    return "spotifyPlaylists";
}

function getFilteredRows() {
    return allRows.filter(d => {
        const searchMatch = !state.search || 
            d.track_name.toLowerCase().includes(state.search.toLowerCase()) || 
            d.artist_name.toLowerCase().includes(state.search.toLowerCase());
        const yearMatch = state.year === "All" || d.released_year === +state.year;
        const platformMatch = state.platform === "All" || d[platformField(state.platform)] > 0;
        const clusterMatch = state.cluster === "All" || d.cluster === state.cluster;
        const artistMatch = state.artist === "All" || d.artistNames.includes(state.artist);

        return searchMatch && yearMatch && platformMatch && clusterMatch && artistMatch;
    });
}

function setupFilters(rows) {
    const years = ["All", ...new Set(rows.map(d => d.released_year))].sort((a, b) => (a === "All" ? -1 : b === "All" ? 1 : b - a));
    const platforms = ["All", "Spotify", "Apple", "Deezer"];
    const clusters = ["All", ...new Set(rows.map(d => d.cluster))].sort();

    bindSelect("#year-filter", years);
    bindSelect("#platform-filter", platforms);
    bindSelect("#cluster-filter", clusters);

    d3.select("#search-input").on("input", event => {
        state.search = event.target.value.trim();
        renderDashboard();
    });

    d3.select("#year-filter").on("change", event => {
        state.year = event.target.value;
        renderDashboard();
    });

    d3.select("#platform-filter").on("change", event => {
        state.platform = event.target.value;
        renderDashboard();
    });

    d3.select("#cluster-filter").on("change", event => {
        state.cluster = event.target.value;
        renderDashboard();
    });

    d3.select("#scatter-metric").on("change", event => {
        state.scatterMetric = event.target.value;
        drawScatterChart(getFilteredRows());
    });

    d3.select("#reset-filters").on("click", () => {
        state.search = "";
        state.year = "All";
        state.platform = "All";
        state.cluster = "All";
        state.artist = "All";

        d3.select("#search-input").property("value", "");
        d3.select("#year-filter").property("value", "All");
        d3.select("#platform-filter").property("value", "All");
        d3.select("#cluster-filter").property("value", "All");

        renderDashboard();
    });
}

function bindSelect(selector, values) {
    const select = d3.select(selector);
    select.selectAll("option")
        .data(values)
        .join("option")
        .attr("value", d => d)
        .text(d => d);
}

/* 1. KPIs */
function createKpiCards(rows) {
    const totalSongs = rows.length;
    const totalStreams = d3.sum(rows, d => d.streams) || 0;
    const avgStreams = totalSongs ? totalStreams / totalSongs : 0;
    const peakYearEntry = d3.rollups(rows, v => d3.sum(v, d => d.streams), d => d.released_year).sort((a, b) => b[1] - a[1])[0];
    const topCluster = d3.rollups(rows, v => d3.sum(v, d => d.streams), d => d.cluster).sort((a, b) => b[1] - a[1])[0];

    const cards = [
        { label: "Total Songs", value: formatNumber(totalSongs), subtext: state.artist !== "All" ? `Filtered by ${state.artist}` : "Filtered track count." },
        { label: "Total Streams", value: formatCompact(totalStreams), subtext: "Combined stream count." },
        { label: "Average Streams", value: formatCompact(avgStreams), subtext: "Mean streams per track." },
        { label: "Top Year", value: peakYearEntry ? peakYearEntry[0] : "N/A", subtext: peakYearEntry ? `${formatCompact(peakYearEntry[1])} streams` : "No data." },
        { label: "Top Cluster", value: topCluster ? topCluster[0] : "N/A", subtext: topCluster ? `${formatCompact(topCluster[1])} streams` : "No data." },
    ];

    d3.select("#kpi-grid")
        .selectAll("article")
        .data(cards)
        .join("article")
        .attr("class", "panel kpi")
        .html(d => `
            <div class="kpi-label">${d.label}</div>
            <div class="kpi-value">${d.value}</div>
            <div class="kpi-subtext">${d.subtext}</div>
        `);
}

/* 2. Highlights & Summary */
function createInsightCards(rows) {
    const yearSummary = d3.rollups(rows, v => d3.sum(v, d => d.streams), d => d.released_year).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const artistSummary = d3.rollups(rows.flatMap(d => d.artistNames.map(name => ({ name, streams: d.streams }))), v => d3.sum(v, d => d.streams), d => d.name).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const clusterSummary = d3.rollups(rows, v => d3.sum(v, d => d.streams), d => d.cluster).sort((a, b) => b[1] - a[1]);

    const insights = [
        { title: "Top Release Years", body: yearSummary.map(([year, streams]) => `<b>${year}</b>: ${formatCompact(streams)}`).join("<br/>") || "No data" },
        { title: "Top Streaming Artists", body: artistSummary.map(([name, streams]) => `<b>${name}</b>: ${formatCompact(streams)}`).join("<br/>") || "No data" },
        { title: "Popular Audio Clusters", body: clusterSummary.map(([name, streams]) => `<b>${name}</b>: ${formatCompact(streams)}`).join("<br/>") || "No data" },
    ];

    d3.select("#insight-grid")
        .selectAll("article")
        .data(insights)
        .join("article")
        .attr("class", "insight")
        .html(d => `<h3>${d.title}</h3><p>${d.body}</p>`);
}

/* 3. Trend Line Chart */
/* Updated drawTrendChart with Zooming & Panning */
function drawTrendChart(rows) {
    const svg = d3.select("#trend-chart");
    const { width, height } = svg.node().viewBox.baseVal;
    const margin = { top: 28, right: 20, bottom: 44, left: 60 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const yearly = d3.rollups(rows, v => d3.sum(v, d => d.streams), d => d.released_year).sort((a, b) => d3.ascending(a[0], b[0]));
    const data = yearly.map(([year, streams]) => ({ year: +year, streams }));

    svg.selectAll("*").remove();

    if (!data.length) {
        svg.append("text").attr("class", "empty-state").attr("x", 30).attr("y", 40).text("No results found.");
        return;
    }

    // 1. Use linear scale for smooth zooming and clean tick intervals
    const xOrig = d3.scaleLinear()
        .domain(d3.extent(data, d => d.year))
        .range([margin.left, margin.left + innerWidth]);

    const y = d3.scaleLinear()
        .domain([0, d3.max(data, d => d.streams) * 1.1])
        .nice()
        .range([margin.top + innerHeight, margin.top]);

    // Create a clip path so chart lines don't bleed outside axes during pan/zoom
    svg.append("defs").append("clipPath")
        .attr("id", "chart-clip")
        .append("rect")
        .attr("x", margin.left)
        .attr("y", margin.top)
        .attr("width", innerWidth)
        .attr("height", innerHeight);

    // Render Grid & Axes
    const xAxisGroup = svg.append("g")
        .attr("class", "axis x-axis")
        .attr("transform", `translate(0,${margin.top + innerHeight})`)
        .call(d3.axisBottom(xOrig).ticks(8).tickFormat(d3.format("d")));

    svg.append("g")
        .attr("class", "axis")
        .attr("transform", `translate(${margin.left},0)`)
        .call(d3.axisLeft(y).ticks(5).tickFormat(d => formatCompact(d)));

    // Chart Area Group with Clipping Applied
    const chartContent = svg.append("g").attr("clip-path", "url(#chart-clip)");

    const line = d3.line()
        .x(d => xOrig(d.year))
        .y(d => y(d.streams))
        .curve(d3.curveMonotoneX);

    const path = chartContent.append("path")
        .datum(data)
        .attr("class", "trend-path")
        .attr("fill", "none")
        .attr("stroke", palette.green)
        .attr("stroke-width", 3)
        .attr("d", line);

    const circles = chartContent.append("g")
        .selectAll("circle")
        .data(data)
        .join("circle")
        .attr("class", "trend-point")
        .attr("cx", d => xOrig(d.year))
        .attr("cy", d => y(d.streams))
        .attr("r", 4)
        .on("mouseenter", (event, d) => showTooltip(event, `Year: ${d.year}`, `Streams: <b>${formatCompact(d.streams)}</b>`))
        .on("mousemove", moveTooltip)
        .on("mouseleave", hideTooltip);

    // 2. Add D3 Zoom & Pan functionality
    const zoom = d3.zoom()
        .scaleExtent([1, 5]) // Limits zoom level (1x to 5x)
        .translateExtent([[margin.left, margin.top], [margin.left + innerWidth, margin.top + innerHeight]])
        .extent([[margin.left, margin.top], [margin.left + innerWidth, margin.top + innerHeight]])
        .on("zoom", (event) => {
            const newX = event.transform.rescaleX(xOrig);
            
            // Update X-axis ticks dynamically during zoom/pan
            xAxisGroup.call(d3.axisBottom(newX).ticks(8).tickFormat(d3.format("d")));

            // Update line and point positions
            const updatedLine = d3.line()
                .x(d => newX(d.year))
                .y(d => y(d.streams))
                .curve(d3.curveMonotoneX);

            path.attr("d", updatedLine);
            circles.attr("cx", d => newX(d.year));
        });

    svg.call(zoom);
}

/* 4. Genre Cluster Bar Chart (Includes Drill-Down / Cross-filtering) */
function drawGenreChart(rows) {
    const svg = d3.select("#genre-chart");
    const { width, height } = svg.node().viewBox.baseVal;
    const margin = { top: 28, right: 20, bottom: 56, left: 60 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const totals = d3.rollups(rows, v => d3.sum(v, d => d.streams), d => d.cluster)
        .sort((a, b) => d3.descending(a[1], b[1]))
        .slice(0, 8)
        .map(([cluster, streams]) => ({ cluster, streams }));

    svg.selectAll("*").remove();

    if (!totals.length) {
        svg.append("text").attr("class", "empty-state").attr("x", 30).attr("y", 40).text("No results found.");
        return;
    }

    const x = d3.scaleBand().domain(totals.map(d => d.cluster)).range([margin.left, margin.left + innerWidth]).padding(0.25);
    const y = d3.scaleLinear().domain([0, d3.max(totals, d => d.streams) * 1.1]).nice().range([margin.top + innerHeight, margin.top]);

    svg.append("g").attr("class", "grid").attr("transform", `translate(${margin.left},0)`).call(d3.axisLeft(y).tickSize(-innerWidth).tickFormat(""));
    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${margin.top + innerHeight})`).call(d3.axisBottom(x));
    svg.append("g").attr("class", "axis").attr("transform", `translate(${margin.left},0)`).call(d3.axisLeft(y).ticks(5).tickFormat(d => formatCompact(d)));

    svg.append("g")
        .selectAll("rect")
        .data(totals)
        .join("rect")
        .attr("class", "bar")
        .attr("x", d => x(d.cluster))
        .attr("y", d => y(d.streams))
        .attr("width", x.bandwidth())
        .attr("height", d => y(0) - y(d.streams))
        .attr("rx", 6)
        .attr("fill", d => state.cluster === d.cluster ? palette.greenHover : palette.green)
        .on("mouseenter", (event, d) => showTooltip(event, `Cluster: ${d.cluster}`, `Streams: <b>${formatCompact(d.streams)}</b><br/><i>Click to drill-down</i>`))
        .on("mousemove", moveTooltip)
        .on("mouseleave", hideTooltip)
        .on("click", (_, d) => {
            state.cluster = state.cluster === d.cluster ? "All" : d.cluster;
            d3.select("#cluster-filter").property("value", state.cluster);
            renderDashboard();
        });
}

/* 5. Audio Feature Scatter Plot (Correlation Feature) */
function drawScatterChart(rows) {
    const svg = d3.select("#scatter-chart");
    const { width, height } = svg.node().viewBox.baseVal;
    const margin = { top: 28, right: 20, bottom: 50, left: 60 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const metric = state.scatterMetric;
    const data = rows.filter(d => d[metric] != null && !isNaN(d[metric]));

    svg.selectAll("*").remove();

    if (!data.length) {
        svg.append("text").attr("class", "empty-state").attr("x", 30).attr("y", 40).text("No scatter data available.");
        return;
    }

    const x = d3.scaleLinear().domain([0, d3.max(data, d => d[metric]) * 1.05]).nice().range([margin.left, margin.left + innerWidth]);
    const y = d3.scaleLinear().domain([0, d3.max(data, d => d.streams) * 1.05]).nice().range([margin.top + innerHeight, margin.top]);

    svg.append("g").attr("class", "grid").attr("transform", `translate(${margin.left},0)`).call(d3.axisLeft(y).tickSize(-innerWidth).tickFormat(""));
    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${margin.top + innerHeight})`).call(d3.axisBottom(x));
    svg.append("g").attr("class", "axis").attr("transform", `translate(${margin.left},0)`).call(d3.axisLeft(y).ticks(5).tickFormat(d => formatCompact(d)));

    svg.append("g")
        .selectAll("circle")
        .data(data)
        .join("circle")
        .attr("class", "scatter-dot")
        .attr("cx", d => x(d[metric]))
        .attr("cy", d => y(d.streams))
        .attr("r", 4.5)
        .on("mouseenter", (event, d) => {
            showTooltip(event, d.track_name, `Artist: <b>${d.artist_name}</b><br/>${metric.toUpperCase()}: <b>${d[metric]}</b><br/>Streams: <b>${formatCompact(d.streams)}</b>`);
        })
        .on("mousemove", moveTooltip)
        .on("mouseleave", hideTooltip);
}

/* 6. Top Artists Leaderboard Bar Chart (Includes Cross-filtering) */
function drawArtistChart(rows) {
    const svg = d3.select("#artist-chart");
    const { width, height } = svg.node().viewBox.baseVal;
    const margin = { top: 28, right: 20, bottom: 70, left: 60 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const artistStreams = d3.rollups(
        rows.flatMap(d => d.artistNames.map(name => ({ name, streams: d.streams }))),
        v => d3.sum(v, d => d.streams),
        d => d.name
    ).sort((a, b) => d3.descending(a[1], b[1])).slice(0, 8);

    const totals = artistStreams.map(([artist, streams]) => ({ artist, streams }));

    svg.selectAll("*").remove();

    if (!totals.length) {
        svg.append("text").attr("class", "empty-state").attr("x", 30).attr("y", 40).text("No artist data available.");
        return;
    }

    const x = d3.scaleBand().domain(totals.map(d => d.artist)).range([margin.left, margin.left + innerWidth]).padding(0.25);
    const y = d3.scaleLinear().domain([0, d3.max(totals, d => d.streams) * 1.1]).nice().range([margin.top + innerHeight, margin.top]);

    svg.append("g").attr("class", "grid").attr("transform", `translate(${margin.left},0)`).call(d3.axisLeft(y).tickSize(-innerWidth).tickFormat(""));
    
    // Rotated Labels for Accessibility
    svg.append("g")
        .attr("class", "axis")
        .attr("transform", `translate(0,${margin.top + innerHeight})`)
        .call(d3.axisBottom(x))
        .selectAll("text")
        .attr("transform", "rotate(-25)")
        .style("text-anchor", "end")
        .attr("dx", "-.8em")
        .attr("dy", ".15em");

    svg.append("g").attr("class", "axis").attr("transform", `translate(${margin.left},0)`).call(d3.axisLeft(y).ticks(5).tickFormat(d => formatCompact(d)));

    svg.append("g")
        .selectAll("rect")
        .data(totals)
        .join("rect")
        .attr("class", "bar")
        .attr("x", d => x(d.artist))
        .attr("y", d => y(d.streams))
        .attr("width", x.bandwidth())
        .attr("height", d => y(0) - y(d.streams))
        .attr("rx", 6)
        .attr("fill", d => state.artist === d.artist ? palette.greenHover : palette.green)
        .on("mouseenter", (event, d) => showTooltip(event, d.artist, `Total Streams: <b>${formatCompact(d.streams)}</b><br/><i>Click to filter dashboard</i>`))
        .on("mousemove", moveTooltip)
        .on("mouseleave", hideTooltip)
        .on("click", (_, d) => {
            state.artist = state.artist === d.artist ? "All" : d.artist;
            renderDashboard();
        });
}

function renderDashboard() {
    const filtered = getFilteredRows();
    createKpiCards(filtered);
    createInsightCards(filtered);
    drawTrendChart(filtered);
    drawGenreChart(filtered);
    drawScatterChart(filtered);
    drawArtistChart(filtered);
}

async function loadDataset(paths) {
    let lastError = null;

    for (const path of paths) {
        try {
            return await d3.csv(path, d3.autoType);
        } catch (error) {
            lastError = error;
        }
    }

    throw lastError || new Error("Unable to load dataset.");
}

// Data Load Initialization
loadDataset(csvPaths).then(rawRows => {
    allRows = rawRows.map(normalizeRow).filter(d => d.releasedAt instanceof Date && !isNaN(d.releasedAt));
    setupFilters(allRows);
    renderDashboard();
}).catch(error => {
    console.error("CSV Loading Error:", error);
    d3.select("body").append("pre")
        .style("color", "#ff5555")
        .style("padding", "24px")
        .style("white-space", "pre-wrap")
        .text(`Failed to load dataset.\n\nTried:\n- ${csvPaths.join("\n- ")}\n\nError: ${error.message}`);
});
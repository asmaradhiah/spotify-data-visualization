const csvPaths = [
    "../spotify-data-visualization/dataset/Most_Streamed_Spotify_Songs_2023_Cleaned.csv",
    "../spotify-data-visualization/dataset/spotify-2023.csv",
    "Most_Streamed_Spotify_Songs_2023_Cleaned.csv",
];

const parseDate = d3.timeParse("%Y-%m-%d");
const formatNumber = d3.format(",");

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/*
 * Stream counts are formatted with K / M / B / T so that billions read as "B"
 * instead of the SI "G" produced by d3.format(".2s").
 */
function formatCompact(value) {
    if (value === null || value === undefined || isNaN(value)) return "0";

    const units = [
        [1e12, "T"],
        [1e9, "B"],
        [1e6, "M"],
        [1e3, "K"],
    ];

    const abs = Math.abs(value);

    for (const [divisor, suffix] of units) {
        if (abs >= divisor) {
            const scaled = value / divisor;
            const digits = Math.abs(scaled) >= 100 ? 0 : Math.abs(scaled) >= 10 ? 1 : 2;
            return `${+scaled.toFixed(digits)}${suffix}`;
        }
    }

    return formatNumber(Math.round(value));
}

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
    // Trend chart drill-down state (year -> quarter -> month)
    trendLevel: "year",
    trendYear: "All",
    trendQuarter: "All",
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
    const releasedMonth = +row.released_month;

    return {
        track_name: row.track_name,
        artist_name: row["artist(s)_name"],
        artistNames,
        releasedAt,
        released_year: +row.released_year,
        released_month: releasedMonth,
        released_quarter: Math.max(1, Math.ceil(releasedMonth / 3)),
        streams: +row.streams,
        spotifyPlaylists: +row.in_spotify_playlists,
        applePlaylists: +row.in_apple_playlists,
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
    if (platform === "Apple") return "applePlaylists";
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

function resetTrendDrill(level = "year") {
    state.trendLevel = level;
    state.trendYear = "All";
    state.trendQuarter = "All";
}

function setupFilters(rows) {
    const years = ["All", ...new Set(rows.map(d => d.released_year))].sort((a, b) => (a === "All" ? -1 : b === "All" ? 1 : b - a));
    // Deezer removed: the cleaned dataset only carries Spotify and Apple playlist columns.
    const platforms = ["All", "Spotify", "Apple"];
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
        resetTrendDrill(state.trendLevel);
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

    // Granularity switch for the streams trend chart
    d3.select("#trend-granularity").on("change", event => {
        resetTrendDrill(event.target.value);
        updateTrendControls();
        drawTrendChart(getFilteredRows());
    });

    // Step back up one drill level
    d3.select("#trend-up").on("click", () => {
        if (state.trendLevel === "month" && state.trendQuarter !== "All") {
            state.trendQuarter = "All";
            state.trendLevel = "quarter";
        } else if (state.trendLevel === "quarter" && state.trendYear !== "All") {
            state.trendYear = "All";
            state.trendLevel = "year";
        } else if (state.trendLevel === "month") {
            state.trendLevel = "quarter";
        } else {
            resetTrendDrill("year");
        }

        updateTrendControls();
        drawTrendChart(getFilteredRows());
    });

    d3.select("#reset-filters").on("click", () => {
        state.search = "";
        state.year = "All";
        state.platform = "All";
        state.cluster = "All";
        state.artist = "All";
        resetTrendDrill("year");

        d3.select("#search-input").property("value", "");
        d3.select("#year-filter").property("value", "All");
        d3.select("#platform-filter").property("value", "All");
        d3.select("#cluster-filter").property("value", "All");
        d3.select("#trend-granularity").property("value", "year");

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

/* 3. Trend Chart: Streams by Year / Quarter / Month with drill-down, zoom & pan */

// Builds the series for the current drill level and drill path.
function buildTrendSeries(rows) {
    let subset = rows;

    if (state.trendYear !== "All") subset = subset.filter(d => d.released_year === +state.trendYear);
    if (state.trendQuarter !== "All") subset = subset.filter(d => d.released_quarter === +state.trendQuarter);

    if (state.trendLevel === "year") {
        return d3.rollups(subset, v => d3.sum(v, d => d.streams), d => d.released_year)
            .map(([year, streams]) => ({
                key: `${year}`,
                label: `${year}`,
                sortKey: +year,
                year: +year,
                quarter: null,
                month: null,
                streams,
                tooltipTitle: `Year ${year}`,
            }))
            .sort((a, b) => d3.ascending(a.sortKey, b.sortKey));
    }

    if (state.trendLevel === "quarter") {
        return d3.rollups(subset, v => d3.sum(v, d => d.streams), d => `${d.released_year}|${d.released_quarter}`)
            .map(([key, streams]) => {
                const [year, quarter] = key.split("|").map(Number);
                return {
                    key,
                    label: state.trendYear === "All" ? `Q${quarter} ${year}` : `Q${quarter}`,
                    sortKey: year * 10 + quarter,
                    year,
                    quarter,
                    month: null,
                    streams,
                    tooltipTitle: `Q${quarter} ${year}`,
                };
            })
            .sort((a, b) => d3.ascending(a.sortKey, b.sortKey));
    }

    // Month level
    return d3.rollups(subset, v => d3.sum(v, d => d.streams), d => `${d.released_year}|${d.released_month}`)
        .map(([key, streams]) => {
            const [year, month] = key.split("|").map(Number);
            const monthName = MONTH_LABELS[month - 1] || `M${month}`;
            return {
                key,
                label: state.trendYear === "All" ? `${monthName} ${year}` : monthName,
                sortKey: year * 100 + month,
                year,
                quarter: Math.max(1, Math.ceil(month / 3)),
                month,
                streams,
                tooltipTitle: `${monthName} ${year}`,
            };
        })
        .sort((a, b) => d3.ascending(a.sortKey, b.sortKey));
}

// Keeps the granularity select, breadcrumb and Back button in sync with state.
function updateTrendControls() {
    d3.select("#trend-granularity").property("value", state.trendLevel);

    const crumbs = ["All years"];
    if (state.trendYear !== "All") crumbs.push(`${state.trendYear}`);
    if (state.trendQuarter !== "All") crumbs.push(`Q${state.trendQuarter}`);
    crumbs.push(state.trendLevel === "year" ? "Yearly" : state.trendLevel === "quarter" ? "Quarterly" : "Monthly");

    d3.select("#trend-breadcrumb").html(
        crumbs.map((c, i) => `<span class="${i === crumbs.length - 1 ? "crumb current" : "crumb"}">${c}</span>`).join('<span class="crumb-sep">/</span>')
    );

    const atRoot = state.trendLevel === "year" && state.trendYear === "All" && state.trendQuarter === "All";
    d3.select("#trend-up").attr("disabled", atRoot ? true : null);
}

function drawTrendChart(rows) {
    const svg = d3.select("#trend-chart");
    const { width, height } = svg.node().viewBox.baseVal;
    const margin = { top: 28, right: 24, bottom: 62, left: 64 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const data = buildTrendSeries(rows);

    svg.selectAll("*").remove();

    if (!data.length) {
        svg.append("text").attr("class", "empty-state").attr("x", 30).attr("y", 40).text("No results found. Adjust the filters or press Back.");
        return;
    }

    // Index-based linear scale keeps zoom/pan working for year, quarter and month views.
    const xOrig = d3.scaleLinear()
        .domain(data.length > 1 ? [0, data.length - 1] : [-0.5, 0.5])
        .range([margin.left, margin.left + innerWidth]);

    const y = d3.scaleLinear()
        .domain([0, (d3.max(data, d => d.streams) || 1) * 1.1])
        .nice()
        .range([margin.top + innerHeight, margin.top]);

    // Clip path so the line does not bleed outside the plotting area while panning
    svg.append("defs").append("clipPath")
        .attr("id", "chart-clip")
        .append("rect")
        .attr("x", margin.left)
        .attr("y", margin.top)
        .attr("width", innerWidth)
        .attr("height", innerHeight);

    svg.append("g")
        .attr("class", "grid")
        .attr("transform", `translate(${margin.left},0)`)
        .call(d3.axisLeft(y).tickSize(-innerWidth).tickFormat(""));

    const xAxisGroup = svg.append("g")
        .attr("class", "axis x-axis")
        .attr("transform", `translate(0,${margin.top + innerHeight})`);

    svg.append("g")
        .attr("class", "axis")
        .attr("transform", `translate(${margin.left},0)`)
        .call(d3.axisLeft(y).ticks(5).tickFormat(d => formatCompact(d)));

    // Only draw ticks that fall on real data points, thinned out when crowded
    function renderXAxis(scale) {
        const [d0, d1] = scale.domain();
        const visible = data.map((_, i) => i).filter(i => i >= d0 - 0.001 && i <= d1 + 0.001);
        const step = Math.max(1, Math.ceil(visible.length / 12));
        const ticks = visible.filter((_, i) => i % step === 0);

        xAxisGroup.call(d3.axisBottom(scale).tickValues(ticks).tickFormat(i => data[i] ? data[i].label : ""));

        const rotate = data.some(d => d.label.length > 5);
        xAxisGroup.selectAll("text")
            .attr("transform", rotate ? "rotate(-30)" : null)
            .style("text-anchor", rotate ? "end" : "middle")
            .attr("dx", rotate ? "-.7em" : null)
            .attr("dy", rotate ? ".2em" : ".7em");
    }

    renderXAxis(xOrig);

    const chartContent = svg.append("g").attr("clip-path", "url(#chart-clip)");

    const line = d3.line()
        .x((d, i) => xOrig(i))
        .y(d => y(d.streams))
        .curve(d3.curveMonotoneX);

    const path = chartContent.append("path")
        .datum(data)
        .attr("class", "trend-line")
        .attr("d", line);

    const canDrill = state.trendLevel !== "month";

    const circles = chartContent.append("g")
        .selectAll("circle")
        .data(data)
        .join("circle")
        .attr("class", "trend-point")
        .attr("cx", (d, i) => xOrig(i))
        .attr("cy", d => y(d.streams))
        .attr("r", 4.5)
        .style("cursor", canDrill ? "pointer" : "default")
        .on("mouseenter", (event, d) => {
            const hint = canDrill
                ? `<br/><i>Click to view ${state.trendLevel === "year" ? "quarters" : "months"}</i>`
                : "";
            showTooltip(event, d.tooltipTitle, `Streams: <b>${formatCompact(d.streams)}</b>${hint}`);
        })
        .on("mousemove", moveTooltip)
        .on("mouseleave", hideTooltip)
        .on("click", (_, d) => {
            if (state.trendLevel === "year") {
                state.trendYear = d.year;
                state.trendQuarter = "All";
                state.trendLevel = "quarter";
            } else if (state.trendLevel === "quarter") {
                state.trendYear = d.year;
                state.trendQuarter = d.quarter;
                state.trendLevel = "month";
            } else {
                return;
            }

            hideTooltip();
            updateTrendControls();
            drawTrendChart(getFilteredRows());
        });

    // Zoom & Pan
    const zoom = d3.zoom()
        .scaleExtent([1, 5])
        .translateExtent([[margin.left, margin.top], [margin.left + innerWidth, margin.top + innerHeight]])
        .extent([[margin.left, margin.top], [margin.left + innerWidth, margin.top + innerHeight]])
        .on("zoom", (event) => {
            const newX = event.transform.rescaleX(xOrig);

            renderXAxis(newX);

            const updatedLine = d3.line()
                .x((d, i) => newX(i))
                .y(d => y(d.streams))
                .curve(d3.curveMonotoneX);

            path.attr("d", updatedLine);
            circles.attr("cx", (d, i) => newX(i));
        });

    svg.call(zoom);
}

/* 4. Genre Cluster Bar Chart (cross-visual filtering) */
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
        // Tooltip shows values only; the click still cross-filters the dashboard.
        .on("mouseenter", (event, d) => showTooltip(event, `Cluster: ${d.cluster}`, `Streams: <b>${formatCompact(d.streams)}</b>`))
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
        // Explicit green fill (previously fell back to the SVG default black)
        .attr("fill", palette.green)
        .attr("fill-opacity", 0.75)
        .attr("stroke", palette.greenHover)
        .attr("stroke-width", 1)
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
    updateTrendControls();
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

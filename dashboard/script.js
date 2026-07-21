const csvPath = "../spotify-data-visualization/dataset/Most_Streamed_Spotify_Songs_2023_Cleaned.csv";

const parseDate = d3.timeParse("%Y-%m-%d");
const formatYear = d3.timeFormat("%Y");
const formatNumber = d3.format(",");
const formatCompact = d3.format(".2s");
const formatPercent = d3.format(".0f");

const palette = {
	streams: "#2050d6",
	streamsSoft: "#7aa7ff",
	accent: "#1ea7a3",
	bar: "#4c83e6",
	barSoft: "#a8c7ff",
};

const tooltip = d3.select("#tooltip");
const state = {
	year: "All",
	platform: "All",
	cluster: "All",
};

let allRows = [];
let yearFloor = null;

function showTooltip(event, title, html) {
	tooltip
		.style("display", "block")
		.style("left", `${event.clientX}px`)
		.style("top", `${event.clientY}px`)
		.html(`<div class="title">${title}</div><div class="meta">${html}</div>`);
}

function moveTooltip(event) {
	tooltip.style("left", `${event.clientX}px`).style("top", `${event.clientY}px`);
}

function hideTooltip() {
	tooltip.style("display", "none");
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
	const artistNames = row["artist(s)_name"].split(/,\s*/).map(name => name.trim()).filter(Boolean);

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

function getFilteredRows() {
	return allRows.filter(d => {
		const yearMatch = state.year === "All" || d.released_year === +state.year;
		const platformMatch = state.platform === "All" || d[platformField(state.platform)] > 0;
		const clusterMatch = state.cluster === "All" || d.cluster === state.cluster;
		return yearMatch && platformMatch && clusterMatch;
	});
}

function platformField(platform) {
	if (platform === "Spotify") return "spotifyPlaylists";
	if (platform === "Apple") return "applePlaylists";
	if (platform === "Deezer") return "deezerPlaylists";
	return "spotifyPlaylists";
}

function setupFilters(rows) {
	const years = ["All", ...new Set(rows.map(d => d.released_year))].sort((a, b) => (a === "All" ? -1 : b === "All" ? 1 : a - b));
	const platforms = ["All", "Spotify", "Apple", "Deezer"];
	const clusters = ["All", ...new Set(rows.map(d => d.cluster))].sort();

	bindSelect("#year-filter", years, d => d);
	bindSelect("#platform-filter", platforms, d => d);
	bindSelect("#cluster-filter", clusters, d => d);

	d3.select("#year-filter").property("value", state.year);
	d3.select("#platform-filter").property("value", state.platform);
	d3.select("#cluster-filter").property("value", state.cluster);

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
	d3.select("#reset-filters").on("click", () => {
		state.year = "All";
		state.platform = "All";
		state.cluster = "All";
		d3.select("#year-filter").property("value", state.year);
		d3.select("#platform-filter").property("value", state.platform);
		d3.select("#cluster-filter").property("value", state.cluster);
		renderDashboard();
	});
}

function bindSelect(selector, values, valueAccessor) {
	const select = d3.select(selector);
	select.selectAll("option").data(values).join("option")
		.attr("value", valueAccessor)
		.text(d => d);
}

function createKpiCards(rows) {
	const totalSongs = rows.length;
	const totalStreams = d3.sum(rows, d => d.streams) || 0;
	const avgStreams = totalSongs ? totalStreams / totalSongs : 0;
	const peakYearEntry = d3.rollups(rows, v => d3.sum(v, d => d.streams), d => d.released_year).sort((a, b) => b[1] - a[1])[0];
	const topSong = rows.length ? rows.reduce((best, current) => (current.streams > best.streams ? current : best), rows[0]) : null;
	const topCluster = d3.rollups(rows, v => d3.sum(v, d => d.streams), d => d.cluster).sort((a, b) => b[1] - a[1])[0];

	const cards = [
		{ label: "Total Songs", value: formatNumber(totalSongs), subtext: `Recent 5 release years${yearFloor ? ` (${yearFloor}-${d3.max(rows, d => d.released_year)})` : ""}.` },
		{ label: "Total Streams", value: formatCompact(totalStreams), subtext: "Combined stream count for the current filters." },
		{ label: "Average Streams", value: formatCompact(avgStreams), subtext: "Mean streams per song." },
		{ label: "Top Year", value: peakYearEntry ? peakYearEntry[0] : "N/A", subtext: peakYearEntry ? `${formatCompact(peakYearEntry[1])} total streams` : "No data available." },
		{ label: "Top Cluster", value: topCluster ? topCluster[0] : "N/A", subtext: topCluster ? `${formatCompact(topCluster[1])} total streams` : "No data available." },
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

function createInsightCards(rows) {
	const yearSummary = d3.rollups(rows, v => d3.sum(v, d => d.streams), d => d.released_year).sort((a, b) => b[1] - a[1]).slice(0, 3);
	const artistSummary = d3.rollups(rows.flatMap(d => d.artistNames.map(name => ({ name, streams: d.streams }))), v => d3.sum(v, d => d.streams), d => d.name).sort((a, b) => b[1] - a[1]).slice(0, 3);
	const clusterSummary = d3.rollups(rows, v => d3.sum(v, d => d.streams), d => d.cluster).sort((a, b) => b[1] - a[1]);

	const insights = [
		{ title: "Top Years", body: yearSummary.map(([year, streams]) => `${year}: ${formatCompact(streams)}`).join(" · ") || "No data" },
		{ title: "Top Artists", body: artistSummary.map(([name, streams]) => `${name}: ${formatCompact(streams)}`).join(" · ") || "No data" },
		{ title: "Genre Clusters", body: clusterSummary.map(([name, streams]) => `${name}: ${formatCompact(streams)}`).join(" · ") || "No data" },
	];

	d3.select("#insight-grid")
		.selectAll("article")
		.data(insights)
		.join("article")
		.attr("class", "insight")
		.html(d => `<h3>${d.title}</h3><p>${d.body}</p>`);
}

function drawTrendChart(rows) {
	const svg = d3.select("#trend-chart");
	const { width, height } = svg.node().viewBox.baseVal;
	const margin = { top: 28, right: 20, bottom: 44, left: 56 };
	const innerWidth = width - margin.left - margin.right;
	const innerHeight = height - margin.top - margin.bottom;

	const yearly = d3.rollups(rows, v => d3.sum(v, d => d.streams), d => d.released_year).sort((a, b) => d3.ascending(a[0], b[0]));
	const data = yearly.map(([year, streams]) => ({ year: +year, streams }));

	svg.selectAll("*").remove();

	if (!data.length) {
		svg.append("text").attr("class", "empty-state").attr("x", 30).attr("y", 40).text("No results for the selected filters.");
		return;
	}

	const x = d3.scalePoint().domain(data.map(d => d.year)).range([margin.left, margin.left + innerWidth]).padding(0.5);
	const y = d3.scaleLinear().domain([0, d3.max(data, d => d.streams) * 1.1]).nice().range([margin.top + innerHeight, margin.top]);

	svg.append("g").attr("class", "grid").attr("transform", `translate(${margin.left},0)`)
		.call(d3.axisLeft(y).tickSize(-innerWidth).tickFormat(""));

	svg.append("g").attr("class", "axis").attr("transform", `translate(0,${margin.top + innerHeight})`)
		.call(d3.axisBottom(x).tickFormat(d3.format("d")));

	svg.append("g").attr("class", "axis").attr("transform", `translate(${margin.left},0)`)
		.call(d3.axisLeft(y).ticks(5).tickFormat(d => formatCompact(d)));

	svg.append("text")
		.attr("x", margin.left)
		.attr("y", 18)
		.attr("fill", "#64748b")
		.attr("font-size", 11)
		.text("Total streams by release year for the current filters");

	const line = d3.line()
		.x(d => x(d.year))
		.y(d => y(d.streams))
		.curve(d3.curveMonotoneX);

	const area = d3.area()
		.x(d => x(d.year))
		.y0(y(0))
		.y1(d => y(d.streams))
		.curve(d3.curveMonotoneX);

	svg.append("path").datum(data).attr("fill", "rgba(32, 80, 214, 0.10)").attr("d", area);

	const path = svg.append("path")
		.datum(data)
		.attr("fill", "none")
		.attr("stroke", palette.streams)
		.attr("stroke-width", 3.5)
		.attr("d", line);

	const total = path.node().getTotalLength();
	path.attr("stroke-dasharray", `${total} ${total}`)
		.attr("stroke-dashoffset", total)
		.transition()
		.duration(1100)
		.ease(d3.easeCubicOut)
		.attr("stroke-dashoffset", 0);

	svg.append("g")
		.selectAll("circle")
		.data(data)
		.join("circle")
		.attr("cx", d => x(d.year))
		.attr("cy", d => y(d.streams))
		.attr("r", 4.8)
		.attr("fill", palette.bar)
		.attr("stroke", "#fff")
		.attr("stroke-width", 2)
		.on("mouseenter", function(event, d) {
			showTooltip(event, d.year, `${formatCompact(d.streams)} total streams`);
		})
		.on("mousemove", moveTooltip)
		.on("mouseleave", hideTooltip);

	const maxPoint = data.reduce((best, current) => current.streams > best.streams ? current : best, data[0]);
	if (maxPoint) {
		svg.append("text")
			.attr("x", x(maxPoint.year))
			.attr("y", y(maxPoint.streams) - 16)
			.attr("text-anchor", "middle")
			.attr("fill", palette.accent)
			.attr("font-size", 11)
			.attr("font-weight", 700)
			.text(formatCompact(maxPoint.streams));
	}
}

function drawGenreChart(rows) {
	const svg = d3.select("#genre-chart");
	const { width, height } = svg.node().viewBox.baseVal;
	const margin = { top: 28, right: 20, bottom: 56, left: 70 };
	const innerWidth = width - margin.left - margin.right;
	const innerHeight = height - margin.top - margin.bottom;

	const totals = d3.rollups(rows, v => d3.sum(v, d => d.streams), d => d.cluster)
		.sort((a, b) => d3.descending(a[1], b[1]))
		.slice(0, 8)
		.map(([cluster, streams]) => ({ cluster, streams }));

	svg.selectAll("*").remove();

	if (!totals.length) {
		svg.append("text").attr("class", "empty-state").attr("x", 30).attr("y", 40).text("No results for the selected filters.");
		return;
	}

	const x = d3.scaleBand().domain(totals.map(d => d.cluster)).range([margin.left, margin.left + innerWidth]).padding(0.24);
	const y = d3.scaleLinear().domain([0, d3.max(totals, d => d.streams) * 1.1]).nice().range([margin.top + innerHeight, margin.top]);

	svg.append("g").attr("class", "grid").attr("transform", `translate(${margin.left},0)`)
		.call(d3.axisLeft(y).tickSize(-innerWidth).tickFormat(""));

	svg.append("g").attr("class", "axis").attr("transform", `translate(0,${margin.top + innerHeight})`)
		.call(d3.axisBottom(x));

	svg.append("g").attr("class", "axis").attr("transform", `translate(${margin.left},0)`)
		.call(d3.axisLeft(y).ticks(5).tickFormat(d => formatCompact(d)));

	svg.append("text")
		.attr("x", margin.left)
		.attr("y", 18)
		.attr("fill", "#64748b")
		.attr("font-size", 11)
		.text("Streams grouped by derived genre clusters");

	const maxValue = d3.max(totals, d => d.streams) || 1;

	svg.append("g")
		.selectAll("rect")
		.data(totals)
		.join("rect")
		.attr("x", d => x(d.cluster))
		.attr("y", d => y(d.streams))
		.attr("width", x.bandwidth())
		.attr("height", d => y(0) - y(d.streams))
		.attr("rx", 14)
		.attr("fill", d => d3.interpolateBlues(0.45 + (d.streams / maxValue) * 0.45))
		.attr("cursor", "pointer")
		.on("mouseenter", function(event, d) {
			d3.select(this).attr("stroke", palette.accent).attr("stroke-width", 2);
			showTooltip(event, d.cluster, `${formatCompact(d.streams)} total streams`);
		})
		.on("mousemove", moveTooltip)
		.on("mouseleave", function() {
			d3.select(this).attr("stroke", "none");
			hideTooltip();
		})
		.on("click", (_, d) => {
			state.cluster = d.cluster;
			d3.select("#cluster-filter").property("value", state.cluster);
			renderDashboard();
		});

	svg.append("g")
		.selectAll("text")
		.data(totals)
		.join("text")
		.attr("x", d => x(d.cluster) + x.bandwidth() / 2)
		.attr("y", d => y(d.streams) - 8)
		.attr("text-anchor", "middle")
		.attr("fill", "#1c2432")
		.attr("font-size", 11)
		.attr("font-weight", 700)
		.text(d => formatCompact(d.streams));
}

function renderDashboard() {
	const filtered = getFilteredRows();
	createKpiCards(filtered);
	createInsightCards(filtered);
	drawTrendChart(filtered);
	drawGenreChart(filtered);
}

d3.csv(csvPath, d3.autoType).then(rawRows => {
	const normalizedRows = rawRows.map(normalizeRow).filter(d => d.releasedAt instanceof Date && !isNaN(d.releasedAt));
	yearFloor = d3.max(normalizedRows, d => d.released_year) - 4;
	allRows = normalizedRows.filter(d => d.released_year >= yearFloor);
	setupFilters(allRows);
	renderDashboard();
}).catch(error => {
	console.error(error);
	d3.select("body").append("pre")
		.style("color", "#1c2432")
		.style("padding", "24px")
		.text(`Failed to load CSV: ${error.message}`);
});

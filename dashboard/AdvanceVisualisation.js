/* ============================================================
   Spotify Music Dashboard — Advanced Visualization Techniques
   Technique 1: Correlation Heat Map
   Technique 2: Parallel Coordinates Plot (cluster-average by default)
   Data: SPOTIFY_DATA (from data.js) — 769 tracks, released_year 2019-2023
   ============================================================ */

const FEATURE_META = {
  danceability:    { label: "Danceability",    accessor: d => d.danceability },
  valence:         { label: "Valence",         accessor: d => d.valence },
  energy:          { label: "Energy",          accessor: d => d.energy },
  acousticness:    { label: "Acousticness",    accessor: d => d.acousticness },
  instrumentalness:{ label: "Instrumentalness",accessor: d => d.instrumentalness },
  liveness:        { label: "Liveness",        accessor: d => d.liveness },
  speechiness:     { label: "Speechiness",     accessor: d => d.speechiness },
  bpm:             { label: "Tempo (BPM)",     accessor: d => d.bpm },
  streams:         { label: "Streams (log10)", accessor: d => Math.log10(d.streams) }
};

const PARALLEL_AXES = ["danceability","valence","energy","acousticness","instrumentalness","liveness","speechiness","bpm"];

const CLUSTER_COLORS = {
  Dance:        "#2ecc71",
  Pop:          "#60a5fa",
  Vocal:        "#f472b6",
  Acoustic:     "#fbbf24",
  Chill:        "#38bdf8",
  Instrumental: "#a78bfa"
};

const state = {
  year: "all",
  platform: "all",
  cluster: "all",
  mode: "all",
  metricSet: "audio",
  legendActive: new Set(Object.keys(CLUSTER_COLORS)),
  brushRanges: {},
  showIndividual: false
};

/* ---------------- helpers ---------------- */
function pearson(xs, ys) {
  const n = xs.length;
  const mx = d3.mean(xs), my = d3.mean(ys);
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    num += dx * dy; dx2 += dx * dx; dy2 += dy * dy;
  }
  const denom = Math.sqrt(dx2 * dy2);
  return denom === 0 ? 0 : num / denom;
}

function fmtG(n) { return Math.round(n / 1e9) + "G"; }
function fmtM(n) { return Math.round(n / 1e6) + "M"; }

function hasSpotify(d) { return d.playlists_spotify > 0 || d.charts_spotify > 0; }
function hasApple(d) { return d.playlists_apple > 0 || d.charts_apple > 0; }

/* Top-bar filters — same fields as the main dashboard page (Year / Platform / Genre Cluster) */
function getFilteredData() {
  return SPOTIFY_DATA.filter(d => {
    if (state.year !== "all" && String(d.year) !== state.year) return false;
    if (state.cluster !== "all" && d.cluster !== state.cluster) return false;
    if (state.platform === "Spotify" && !hasSpotify(d)) return false;
    if (state.platform === "Apple" && !hasApple(d)) return false;
    return true;
  });
}

/* Adds the secondary Mode filter, used only by the two advanced charts below */
function getAdvancedData() {
  return getFilteredData().filter(d => state.mode === "all" || d.mode === state.mode);
}

/* ---------------- filter bar setup ---------------- */
function initFilters() {
  const years = Array.from(new Set(SPOTIFY_DATA.map(d => d.year))).sort();
  const yearSel = d3.select("#yearFilter");
  yearSel.selectAll("option.dyn")
    .data(years)
    .enter()
    .append("option")
    .attr("class", "dyn")
    .attr("value", d => d)
    .text(d => d);

  const clusters = Object.keys(CLUSTER_COLORS);
  const clusterSel = d3.select("#clusterFilter");
  clusterSel.selectAll("option.dyn")
    .data(clusters)
    .enter()
    .append("option")
    .attr("class", "dyn")
    .attr("value", d => d)
    .text(d => d);

  yearSel.on("change", function () { state.year = this.value; refreshAll(); });
  d3.select("#platformFilter").on("change", function () { state.platform = this.value; refreshAll(); });
  clusterSel.on("change", function () { state.cluster = this.value; refreshAll(); });
  d3.select("#modeFilter").on("change", function () { state.mode = this.value; drawHeatmap(); drawParallel(); });
  d3.select("#metricFilter").on("change", function () { state.metricSet = this.value; drawHeatmap(); });
  d3.select("#showIndividualToggle").on("change", function () { state.showIndividual = this.checked; drawParallel(); });

  d3.select("#resetBtn").on("click", () => {
    state.year = "all"; state.platform = "all"; state.cluster = "all"; state.mode = "all";
    state.metricSet = "audio";
    state.legendActive = new Set(Object.keys(CLUSTER_COLORS));
    state.brushRanges = {};
    state.showIndividual = false;
    yearSel.property("value", "all");
    d3.select("#platformFilter").property("value", "all");
    clusterSel.property("value", "all");
    d3.select("#modeFilter").property("value", "all");
    d3.select("#metricFilter").property("value", "audio");
    d3.select("#showIndividualToggle").property("checked", false);
    refreshAll();
  });
}

function refreshAll() {
  renderKPIs();
  drawHeatmap();
  drawParallel();
}

/* ---------------- KPI cards (same 5 metrics as the main dashboard page) ---------------- */
function renderKPIs() {
  const data = getFilteredData();
  const totalStreams = d3.sum(data, d => d.streams);
  const avgStreams = d3.mean(data, d => d.streams) || 0;

  const byYear = Array.from(d3.rollup(data, v => d3.sum(v, d => d.streams), d => d.year),
    ([year, total]) => ({ year, total })).sort((a, b) => b.total - a.total);
  const topYear = byYear[0];

  const byCluster = Array.from(d3.rollup(data, v => d3.sum(v, d => d.streams), d => d.cluster),
    ([cluster, total]) => ({ cluster, total })).sort((a, b) => b.total - a.total);
  const topCluster = byCluster[0];

  const cards = [
    { label: "Total songs", value: data.length, desc: "Recent 5 release years (2019-2023)." },
    { label: "Total streams", value: fmtG(totalStreams), desc: "Combined stream count for the current filters." },
    { label: "Average streams", value: fmtM(avgStreams), desc: "Mean streams per song." },
    { label: "Top year", value: topYear ? topYear.year : "-", desc: topYear ? `${fmtG(topYear.total)} total streams` : "" },
    { label: "Top cluster", value: topCluster ? topCluster.cluster : "-", desc: topCluster ? `${fmtG(topCluster.total)} total streams` : "" }
  ];

  const sel = d3.select("#kpiRow").selectAll(".kpi").data(cards);

const enter = sel.enter()
    .append("div")
    .attr("class", "kpi");

enter.append("p").attr("class", "kpi-label");
enter.append("p").attr("class", "kpi-value");
enter.append("p").attr("class", "kpi-subtext");

const merged = enter.merge(sel);

merged.select(".kpi-label").text(d => d.label);
merged.select(".kpi-value").text(d => d.value);
merged.select(".kpi-subtext").text(d => d.desc);

sel.exit().remove();
}

/* ================================================================
   TECHNIQUE 1 — CORRELATION HEAT MAP
   ================================================================ */
function drawHeatmap() {
  const data = getAdvancedData();
  const keys = state.metricSet === "full"
    ? ["danceability","valence","energy","acousticness","instrumentalness","liveness","speechiness","bpm","streams"]
    : ["danceability","valence","energy","acousticness","instrumentalness","liveness","speechiness","bpm"];

  const vectors = {};
  keys.forEach(k => { vectors[k] = data.map(FEATURE_META[k].accessor); });

  const matrix = [];
  keys.forEach((rk, ri) => {
    keys.forEach((ck, ci) => {
      const r = ri === ci ? 1 : (data.length > 1 ? pearson(vectors[rk], vectors[ck]) : 0);
      matrix.push({ row: rk, col: ck, ri, ci, r });
    });
  });

  const container = d3.select("#heatmap");
  container.selectAll("*").remove();

  const cell = 58;
  const margin = { top: 130, right: 20, bottom: 20, left: 140 };
  const width = keys.length * cell;
  const height = keys.length * cell;

  const svg = container.append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom + 60);

  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  const color = d3.scaleSequential(d3.interpolateRdYlGn).domain([-1, 1]);

  g.selectAll(".col-label")
    .data(keys)
    .enter()
    .append("text")
    .attr("class", "axis-label")
    .attr("x", (d, i) => i * cell + cell / 2)
    .attr("y", -12)
    .attr("text-anchor", "start")
    .attr("transform", (d, i) => `rotate(-40, ${i * cell + cell / 2}, -12)`)
    .text(d => FEATURE_META[d].label);

  g.selectAll(".row-label")
    .data(keys)
    .enter()
    .append("text")
    .attr("class", "axis-label")
    .attr("x", -10)
    .attr("y", (d, i) => i * cell + cell / 2 + 4)
    .attr("text-anchor", "end")
    .text(d => FEATURE_META[d].label);

  const tooltip = d3.select("#heatmapTooltip");

  g.selectAll(".cell")
    .data(matrix)
    .enter()
    .append("rect")
    .attr("class", "cell")
    .attr("x", d => d.ci * cell)
    .attr("y", d => d.ri * cell)
    .attr("width", cell - 3)
    .attr("height", cell - 3)
    .attr("rx", 4)
    .attr("fill", d => color(d.r))
    .attr("stroke", "rgba(0,0,0,0.25)")
    .on("mousemove", function (event, d) {
      const [mx, my] = d3.pointer(event, container.node());
      tooltip
        .style("opacity", 1)
        .style("left", mx + "px")
        .style("top", my + "px")
        .html(`<strong>${FEATURE_META[d.row].label}</strong> vs <strong>${FEATURE_META[d.col].label}</strong><br/>r = ${d.r.toFixed(3)}`);
      d3.select(this).attr("stroke", "#eef2ee").attr("stroke-width", 1.5);
    })
    .on("mouseleave", function () {
      tooltip.style("opacity", 0);
      d3.select(this).attr("stroke", "rgba(0,0,0,0.25)").attr("stroke-width", 1);
    });

  g.selectAll(".cell-text")
    .data(matrix)
    .enter()
    .append("text")
    .attr("x", d => d.ci * cell + (cell - 3) / 2)
    .attr("y", d => d.ri * cell + (cell - 3) / 2 + 4)
    .attr("text-anchor", "middle")
    .attr("font-size", "11px")
    .attr("font-weight", 700)
    .attr("fill", d => Math.abs(d.r) > 0.55 ? "#06210f" : "#0b1a12")
    .style("pointer-events", "none")
    .text(d => d.r.toFixed(2));

  const legendW = 220, legendH = 12;
  const defs = svg.append("defs");
  const grad = defs.append("linearGradient").attr("id", "heatLegendGrad").attr("x1", "0%").attr("x2", "100%");
  d3.range(0, 1.01, 0.1).forEach(t => {
    grad.append("stop").attr("offset", `${t * 100}%`).attr("stop-color", color(-1 + t * 2));
  });
  const legendG = svg.append("g").attr("transform", `translate(${margin.left}, ${margin.top + height + 34})`);
  legendG.append("rect").attr("width", legendW).attr("height", legendH).attr("rx", 6).style("fill", "url(#heatLegendGrad)");
  legendG.append("text").attr("class", "axis-label").attr("x", 0).attr("y", legendH + 16).text("-1.0");
  legendG.append("text").attr("class", "axis-label").attr("x", legendW / 2).attr("y", legendH + 16).attr("text-anchor", "middle").text("0.0");
  legendG.append("text").attr("class", "axis-label").attr("x", legendW).attr("y", legendH + 16).attr("text-anchor", "end").text("1.0");
}

/* ================================================================
   TECHNIQUE 2 — PARALLEL COORDINATES PLOT
   Default view: one bold line per genre cluster (the average shape).
   Toggle: overlay all individual tracks as thin lines for deep-dive exploration.
   ================================================================ */
function drawParallel() {
  const data = getAdvancedData();
  const container = d3.select("#parallel");
  container.selectAll("*").remove();

  const margin = { top: 40, right: 40, bottom: 20, left: 40 };
  const width = Math.max(760, PARALLEL_AXES.length * 130);
  const height = 420;

  const svg = container.append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom);

  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  const x = d3.scalePoint().domain(PARALLEL_AXES).range([0, width]).padding(0.5);
  const y = {};
  PARALLEL_AXES.forEach(feat => {
    const acc = FEATURE_META[feat].accessor;
    y[feat] = d3.scaleLinear()
      .domain(d3.extent(data.length ? data : SPOTIFY_DATA, acc)).nice()
      .range([height, 0]);
  });

  function linePath(getVal) {
    return d3.line()(PARALLEL_AXES.map(feat => [x(feat), y[feat](getVal(feat))]));
  }

  function passesActiveBrushes(d) {
    return Object.entries(state.brushRanges).every(([feat, range]) => {
      if (!range) return true;
      const v = FEATURE_META[feat].accessor(d);
      return v >= range[0] && v <= range[1];
    });
  }

  const tooltip = d3.select("#parallelTooltip");
  const linesG = g.append("g").attr("class", "lines");

  /* ---- individual track lines (only when toggle is on) ---- */
  let trackPaths = null;
  if (state.showIndividual) {
    trackPaths = linesG.append("g").attr("class", "individual-lines")
      .selectAll("path")
      .data(data)
      .enter()
      .append("path")
      .attr("class", "track-line")
      .attr("d", d => linePath(feat => FEATURE_META[feat].accessor(d)))
      .attr("fill", "none")
      .attr("stroke", d => CLUSTER_COLORS[d.cluster] || "#888")
      .attr("stroke-width", 1)
      .attr("opacity", d => (state.legendActive.has(d.cluster) && passesActiveBrushes(d)) ? 0.18 : 0.02)
      .style("cursor", "pointer")
      .on("mousemove", function (event, d) {
        d3.select(this).raise().attr("stroke-width", 2.4).attr("opacity", 1);
        const [mx, my] = d3.pointer(event, container.node());
        tooltip
          .style("opacity", 1)
          .style("left", mx + "px")
          .style("top", my + "px")
          .html(`<strong>${d.track}</strong><br/>${d.artist}<br/>Cluster: ${d.cluster} &middot; ${d.year}<br/>Streams: ${fmtM(d.streams)}`);
      })
      .on("mouseleave", function (event, d) {
        d3.select(this)
          .attr("stroke-width", 1)
          .attr("opacity", (state.legendActive.has(d.cluster) && passesActiveBrushes(d)) ? 0.18 : 0.02);
        tooltip.style("opacity", 0);
      });
  }

  /* ---- cluster-average lines (always shown, bold, on top) ---- */
  const clusterAverages = Object.keys(CLUSTER_COLORS).map(cluster => {
    const members = data.filter(d => d.cluster === cluster);
    if (!members.length) return null;
    const means = {};
    PARALLEL_AXES.forEach(feat => { means[feat] = d3.mean(members, FEATURE_META[feat].accessor); });
    return { cluster, means, count: members.length };
  }).filter(Boolean);

  const avgPaths = linesG.append("g").attr("class", "average-lines")
    .selectAll("path")
    .data(clusterAverages)
    .enter()
    .append("path")
    .attr("class", "avg-line")
    .attr("d", d => linePath(feat => d.means[feat]))
    .attr("fill", "none")
    .attr("stroke", d => CLUSTER_COLORS[d.cluster])
    .attr("stroke-width", 3.5)
    .attr("stroke-linecap", "round")
    .attr("opacity", d => state.legendActive.has(d.cluster) ? 0.95 : 0.06)
    .style("cursor", "pointer")
    .on("mousemove", function (event, d) {
      d3.select(this).raise().attr("stroke-width", 5);
      const [mx, my] = d3.pointer(event, container.node());
      tooltip
        .style("opacity", 1)
        .style("left", mx + "px")
        .style("top", my + "px")
        .html(`<strong>${d.cluster}</strong> average shape<br/>${d.count} tracks in view`);
    })
    .on("mouseleave", function () {
      d3.select(this).attr("stroke-width", 3.5);
      tooltip.style("opacity", 0);
    });

  function updateOpacity() {
    if (trackPaths) {
      trackPaths.attr("opacity", d => (state.legendActive.has(d.cluster) && passesActiveBrushes(d)) ? 0.18 : 0.02);
    }
    avgPaths.attr("opacity", d => state.legendActive.has(d.cluster) ? 0.95 : 0.06);
  }

  /* ---- axes, with brushing enabled only in individual-track mode ---- */
  const axisG = g.selectAll(".axisgroup")
    .data(PARALLEL_AXES)
    .enter()
    .append("g")
    .attr("class", "axisgroup")
    .attr("transform", d => `translate(${x(d)},0)`);

  axisG.each(function (feat) {
    d3.select(this).append("g")
      .attr("class", "axis")
      .call(d3.axisLeft(y[feat]).ticks(5));
  });

  axisG.append("text")
    .attr("class", "axis-label")
    .attr("y", -14)
    .attr("text-anchor", "middle")
    .attr("font-size", "12px")
    .attr("font-weight", 700)
    .text(feat => FEATURE_META[feat].label);

  if (state.showIndividual) {
    axisG.each(function (feat) {
      const brush = d3.brushY()
        .extent([[-9, 0], [9, height]])
        .on("start brush end", (event) => {
          if (!event.selection) {
            delete state.brushRanges[feat];
          } else {
            const [y0, y1] = event.selection;
            state.brushRanges[feat] = [y[feat].invert(y1), y[feat].invert(y0)];
          }
          updateOpacity();
        });
      d3.select(this).append("g").attr("class", "brush").call(brush);
    });
  } else {
    state.brushRanges = {};
  }

  renderLegend();
}

/* ---------------- legend for clusters ---------------- */
function renderLegend() {
  const clusters = Object.keys(CLUSTER_COLORS);
  const sel = d3.select("#clusterLegend").selectAll(".legend-chip").data(clusters, d => d);

  const enter = sel.enter().append("div").attr("class", "legend-chip");
  enter.append("span").attr("class", "swatch");
  enter.append("span").attr("class", "chip-label");

  const merged = enter.merge(sel);
  merged.select(".swatch").style("background", d => CLUSTER_COLORS[d]);
  merged.select(".chip-label").text(d => d);
  merged.classed("active", d => state.legendActive.has(d));

  merged.on("click", (event, d) => {
    if (state.legendActive.has(d)) {
      if (state.legendActive.size === 1) {
        state.legendActive = new Set(Object.keys(CLUSTER_COLORS));
      } else {
        state.legendActive.delete(d);
      }
    } else {
      state.legendActive.add(d);
    }
    renderLegend();
    d3.selectAll("#parallel path.track-line").attr("opacity", dd => {
      const passes = Object.entries(state.brushRanges).every(([feat, range]) => {
        if (!range) return true;
        const v = FEATURE_META[feat].accessor(dd);
        return v >= range[0] && v <= range[1];
      });
      return (state.legendActive.has(dd.cluster) && passes) ? 0.18 : 0.02;
    });
    d3.selectAll("#parallel path.avg-line").attr("opacity", dd => state.legendActive.has(dd.cluster) ? 0.95 : 0.06);
  });
}

/* ---------------- init ---------------- */
initFilters();
refreshAll();

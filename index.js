const sliceData = (data) => {
    return data.slice(0, 100);
}

function expandArtistNodesAggregationRecursively(artists, currentDegree, maxDegree, aggregator, artist) {
    const artistId = artist.firstname + artist.surname;
    const currentNode = artists.find(a => a.firstname == artist.firstname && a.surname == artist.surname);
    const eventIds = currentNode ? currentNode.concerts.map(c => c.id) : [];
    aggregator.nodes.set(artistId, Object.assign(artist, { artistId, linkCount: eventIds.length }));

    if(currentDegree <= maxDegree && eventIds.length) {
        
        // iterate through events
        eventIds.forEach( eId => {
            const nextArtists = events.find(e => e.id === eId).artists;
            // iterate through current event's artists
            nextArtists.forEach( a => {
                const targetArtistId = a.firstname + a.surname;
                const linkExists = aggregator.links.some( l => {
                    return l.eventId === eId && 
                        (( l.target === targetArtistId && l.source === artistId ) ||
                        ( l.source === targetArtistId && l.target === artistId ))
                })
                if( artistId !== targetArtistId && !linkExists) {
                    aggregator.links.push({ source: artistId, target: targetArtistId, eventId: eId });
                    expandArtistNodesAggregationRecursively(artists, events, currentDegree + 1, maxDegree, aggregator, a);
                } else {
                    // artist already exists, just add linkCount
                    const artist = aggregator.nodes.get(targetArtistId);
                    artist.linkCount ++;
                }
            });
        });
    }
}

d3.json("moers-artists2021-05-09-095704.json")
    .then((data) => {

        const artistNodes = sliceData(data).map((artist) => {
            return Object.assign(artist, { id: artist.firstname + artist.surname, type: "artist", numberOfConcerts: artist.concerts.length })
        });

        const concertNodes = sliceData(data).reduce((aggregator, artist) => {
            artist.concerts.forEach((concert) => {
                if(!aggregator[concert.id]) {
                    aggregator[concert.id] = concert;
                    aggregator[concert.id].type = "concert";
                    aggregator[concert.id].numberOfArtists = 0;
                }
                aggregator[concert.id].numberOfArtists++;
            });
            return aggregator;
        }, {});

        const links = artistNodes.map((artist) => {
            const links = artist.concerts.map(concert => {
                return {
                    source: artist.id,
                    target: concert.id,
                    weight: 1
                }
            })
            return links;
        }).flat();

        const nodes = artistNodes.concat(Object.keys(concertNodes).map((concertId) => concertNodes[concertId]));

        return { nodes, links };
    })
    .then((data) => {
        console.log("Got data?", data);

        const determineNumberLinks = () => {
            return d3.max(data.nodes.map(n => {
                if(n.type === "artist") return n.numberOfConcerts;
                return n.numberOfArtists;
                }))
        }

        // define scales (for node circle radius, node colour, and font size of labels)
        const nodeScale = d3.scaleLinear()
            .domain([0, determineNumberLinks() ])
            .range([12, 30]);

        const colorScale = d3.scaleOrdinal(d3.schemeCategory10);
        
        const fontSizeScale = d3.scaleLinear()
            .domain([0, determineNumberLinks() ])
            .range([7, 12]);

        // define force layout simulation
        const simulation = createSimulation(data);
        // get svg root element
        const svg = d3.select("#Target");
        // create links / edges
        const link = createLinks(svg, data);
        // create nodes
        const node = createNodeCircles(svg, data, nodeScale, colorScale);
        node.call(drag(simulation));
        // create text (for node labels)
        const textContainer = createTextContainer(svg, data, fontSizeScale);        
        // create hover card (for mouseover text)
        const hoverCard = new HoverCard(svg);
        initMouseEvents(node, hoverCard, simulation);
        // define d3 force layout's updating behaviour (on every tick)
        simulation.on("tick", () => tickFunction(textContainer, nodeScale, node, link, hoverCard));
    });

function createLinks(svg, data) {
    return svg
        .selectAll("path.link")
        .data(data.links)
        .enter()
        .append("path")
        .attr("stroke", "#999")
        .attr("fill", "none");
}

function createNodeCircles(svg, data, nodeScale, colorScale) {

    const node = svg
        .selectAll("circle")
        .data(data.nodes)
        .enter()
        .append("circle")
        .attr("r", (d) => {
            switch(d.type) {
                case "concert": return nodeScale(d.numberOfArtists);
                case "artist": return nodeScale(d.numberOfConcerts);
                default: return nodeScale(1);
            }
        })
        .attr("stroke", "#ccc")
        .attr("stroke-width", 0.5)
        .style("fill", (d) => colorScale(d.type));

    return node;
}

function createSimulation(data) {
    return d3.forceSimulation(data.nodes)
        .force("charge", d3.forceManyBody().strength(-100))
        .force("link", d3.forceLink(data.links)
            .id(d => d.id)
            .distance(50))
        .force("center", d3.forceCenter(600, 400))
        .force("gravity", d3.forceManyBody().strength(7.5));
}

function createTextContainer(svg, data, fontSizeScale) {
    return svg
        .selectAll("g.label")
        .data(data.nodes)
        .enter()
        .append("g")
        .append("text")
        .text((d) => {
            switch(d.type) {
                case "artist":
                    return [...d.firstname.split(" ").map(s => s.substring(0,1)), d.surname.substring(0,1)].join("");
                case "concert": 
                    return d.year;
                default:
                    return "";
            }
        })
        .attr("font-size", (d) => {
            switch(d.type) {
                case "concert": return fontSizeScale(d.numberOfArtists);
                case "artist": return fontSizeScale(d.numberOfConcerts);
                default: return fontSizeScale(1);
            }
        });
}

function drag(simulation) {

    const dragStarted = (event, d) => {
        if(!event.active) {
            simulation.alphaTarget(0.3).restart();
        }

        d.fx = d.x;
        d.fy = d.y;
    }

    const dragged = (event, d) => {

        d.fx = event.x;
        d.fy = event.y;

    }

    const dragEnded = (event, d) => {
        if(!event.active) {
            simulation.alphaTarget(0);
        }

        d.fx = null;
        d.fy = null;
    }

    return d3.drag()
        .on("start", dragStarted)
        .on("drag", dragged)
        .on("end", dragEnded);
}

function initMouseEvents(node, hoverCard, simulation) {

    node.on("mouseover", (event, d) => {

        hoverCard.card.attr("display", "block");

        hoverCard.currentTarget = event.target;
        const cardTextTitleString = d.type === "concert" ? "Konzert" : "Künstler";
        const cardTextContent1String = d.type === "concert" ? d.concert : d.firstname + " " + d.surname;
        const cardTextContent2String = d.type === "concert" ? d.starttime : d.instruments.join(", ");

        hoverCard.cardTextTitle.text(cardTextTitleString);
        hoverCard.cardTextContent1.text(cardTextContent1String);
        hoverCard.cardTextContent2.text(cardTextContent2String);

        const cardTextContent1Width = hoverCard.cardTextContent1.node().getBBox().width;
        const cardTextContent2Width = hoverCard.cardTextContent2.node().getBBox().width;
        const cardWidth = Math.max(cardTextContent1Width, cardTextContent2Width);

        hoverCard.cardBackground.attr("width", cardWidth + 16);

        simulation.alphaTarget(0).restart();
    });

    node.on("mouseout", () => {
        hoverCard.currentTarget = null;
        hoverCard.card.attr("display", "none");
    });
}

const lineGenerator = d3.line()
    .curve(d3.curveCardinal);

function tickFunction(textContainer, nodeScale, node, link, hoverCard) {

    textContainer
        .attr("transform", (d) => {
            const numberOfLinks = d.type === "concert" ? nodeScale(d.numberOfArtists) : nodeScale(d.numberOfConcerts);
            const scale = nodeScale(numberOfLinks);
            return `translate(${d.x - scale / 2}, ${d.y})`;
        });

    node.attr("cx", (d) => d.x)
        .attr("cy", (d) => d.y);

    link.attr("d", (d) => {
        return lineGenerator([
            [d.source.x, d.source.y],
            [d.target.x, d.target.y]
        ]);
    });

    if (hoverCard.currentTarget) {

        const radius = hoverCard.currentTarget.r.baseVal.value;
        const xPos = hoverCard.currentTarget.cx.baseVal.value + radius + 3;
        const yPos = hoverCard.currentTarget.cy.baseVal.value + radius + 3;

        hoverCard.card.attr("transform", `translate(${xPos}, ${yPos})`);
    }
}

class HoverCard {

    constructor(svg) {
        this.card = svg
            .append("g")
            .attr("pointer-events", "none")
            .attr("display", "none");

        this.cardBackground = this.card
            .append("rect")
            .attr("width", 250)
            .attr("height", 65)
            .attr("fill", "#eee")
            .attr("stroke", "#333")
            .attr("rx", 4);

        this.cardTextTitle = this.card
            .append("text")
            .attr("font-size", 14)
            .attr("transform", "translate(8, 20)")
            .text("DEFAULT NAME");

        this.cardTextContent1 = this.card
            .append("text")
            .attr("font-size", 12)
            .attr("transform", "translate(8, 35)")
            .text("DEFAULT TEXT");
        
        this.cardTextContent2 = this.card
            .append("text")
            .attr("font-size", 12)
            .attr("transform", "translate(8, 50)")
            .text("DEFAULT TEXT");

        this.currentTarget = null;
    }
}

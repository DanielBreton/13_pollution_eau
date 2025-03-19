"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ClipExtension } from "@deck.gl/extensions";

import ReactMapGl, { MapRef } from "react-map-gl/maplibre";
import { GeoJsonLayer } from "@deck.gl/layers";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Protocol } from "pmtiles";
import layers from "protomaps-themes-base";
import { Leva, useControls } from "leva";
import { DeckGLOverlay } from "./DeckGLOverlay";
import { PMTilesSource } from "@loaders.gl/pmtiles";
import { GeoBoundingBox, TileLayer } from "@deck.gl/geo-layers";
import { Prelevement } from "@/types/prelevement";
import { getRegionColor } from "@/utils/getRegionColor";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const SOURCE = "protomaps";
// const OVERLAY_SOURCE = "communes";
const OVERLAY_LAYER = "communes-layer";

interface MapProps {
  pollutionData: Record<string, Prelevement>;
}

export default function Map({ pollutionData }: MapProps) {
  const mapRef = useRef<MapRef>(null);
  const [hoveredElement, setHoveredElement] = useState<
    number | string | undefined
  >(undefined);
  const [tileSource] = useState<PMTilesSource | null>(() => {
    const source = new PMTilesSource({
      url: "communes.pmtiles",
    });
    return source;
  });
  const [selectedCommune, setSelectedCommune] = useState<string | null>(null);
  const [communeData, setCommuneData] = useState<
    { year: string; value: number }[]
  >([]);

  // controls from Leva is a library for adding a GUI to help us try out different styles.
  // we're going to discard it once designers make a decision on the map style
  const {
    year,
    theme,
    language,
    customizeCountryBorders,
    countryBorderWidth,
    countryBorderColor,
    customizeRegionBorders,
    regionBorderWidth,
    regionBorderColor,
    regionDashline,
  } = useControls({
    year: {
      options: ["2020", "2021", "2022", "2023", "2024"],
      value: "2024",
    },
    theme: {
      options: ["light", "dark", "white", "grayscale", "black"],
      value: "white",
    },
    language: {
      options: ["en", "fr"],
      value: "fr",
    },
    // country
    customizeCountryBorders: {
      value: true,
    },
    countryBorderWidth: {
      value: 3,
      min: 1,
      max: 10,
      step: 1,
      render: (get) => get("customizeCountryBorders"),
    },
    countryBorderColor: "#bdb8b8",
    // region
    customizeRegionBorders: {
      value: true,
    },
    regionBorderWidth: {
      value: 2,
      min: 1,
      max: 8,
      step: 1,
      render: (get) => get("customizeRegionBorders"),
    },
    regionBorderColor: "#d7d7d7",
    regionDashline: {
      value: true,
      render: (get) => get("customizeRegionBorders"),
    },
  });

  useEffect(() => {
    const protocol = new Protocol();
    maplibregl.addProtocol("pmtiles", protocol.tile);
    return () => {
      maplibregl.removeProtocol("pmtiles");
    };
  }, []);

    useEffect(() => {
      if (selectedCommune) {
        const prelevement = pollutionData[selectedCommune];
        if (prelevement) {
          setCommuneData(
            Object.keys(prelevement)
              .filter((key) => key.match(/^\d{4}$/))
              .map((year) => ({
                year,
                value: Number(prelevement[year as keyof Prelevement]) || 0,
              }))
          );
        } else {
          setCommuneData([]);
        }
      }
    }, [selectedCommune, pollutionData]);

  useEffect(() => {
    if (selectedCommune) {
      const prelevement = pollutionData[selectedCommune];

      if (prelevement) {
        setCommuneData(
          Object.keys(prelevement)
            .filter((key) => key.match(/^\d{4}$/)) 
            .map((year) => {
              let value = prelevement[year as keyof Prelevement];
              if (value === "C") {
                value = 2;
              } else if (value === "N") {
                value = 5;
              } else if (value === "-") {
                value = 0;
              } else if (typeof value === "string") {
                value = Number(value);
              }
              if (isNaN(value)) {
                value = 0;
              }
              return {
                year,
                value,
              };
            })
        );
      } else {
        setCommuneData([]);
      }
    }
  }, [selectedCommune, pollutionData]);

  const deckLayers = useMemo(() => {
    const updateTriggers = {
      getFillColor: [year, hoveredElement],
    };

    return [
      new TileLayer({
        id: OVERLAY_LAYER,
        getTileData: tileSource && tileSource.getTileData,
        maxRequests: 20,
        pickable: true,
        renderSubLayers: (props) => {
          const { west, south, east, north } = props.tile
            .bbox as GeoBoundingBox;
          return new GeoJsonLayer({
            id: `${props.id}-geojson`,
            data: props.data as GeoJSON.FeatureCollection,
            getFillColor: (d) => {
              const communeCode = d.properties.commune_code_insee;
              const prelevement = pollutionData[communeCode] as Prelevement;
              const isHovered = communeCode === hoveredElement;
              return getRegionColor(
                String(prelevement[year as keyof Prelevement]),
                isHovered
              );
            },
            lineWidthMinPixels: 1,
            stroked: false,
            pickable: true,
            updateTriggers,
            // avoid the overlapping grid lines show up: https://qiita.com/northprint/items/a255e74fc771a7d8b995
            extensions: [new ClipExtension()],
            clipBounds: [west, south, east, north],
          });
        },
        onHover: ({ object }) => {
          if (object) {
            setHoveredElement(object.properties.commune_code_insee);
            if (object) {
              const communeCode = object.properties.commune_code_insee;
              setSelectedCommune(communeCode);
            }
          } else {
            setHoveredElement(undefined);
          }
        },
        onClick: ({ object }) => {
          console.log(
            "onClick commune ID",
            object.properties.commune_code_insee
          );
        },
        // force update the layer data changes
        updateTriggers,
      }),
    ];
  }, [tileSource, year, pollutionData, hoveredElement]);

  return (
    <>
      <ReactMapGl
        ref={mapRef}
        style={{ width: "100%", height: "90vh" }}
        mapStyle={{
          version: 8,
          glyphs:
            "https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf",
          sprite:
            "https://protomaps.github.io/basemaps-assets/sprites/v4/light",
          sources: {
            protomaps: {
              type: "vector",
              maxzoom: 15,
              url: "https://api.protomaps.com/tiles/v4.json?key=707d8bc70b393fc0",
              attribution:
                '<a href="https://osm.org/copyright">© OpenStreetMap</a>',
            },
          },
          layers: [
            ...layers(SOURCE, theme, language).filter(
              (layer) =>
                ![
                  customizeCountryBorders ? "boundaries_country" : undefined,
                  customizeRegionBorders ? "places_region" : undefined,
                ].includes(layer.id)
            ),
            ...(customizeCountryBorders
              ? [
                  {
                    id: "boundaries_country",
                    type: "line",
                    source: SOURCE,
                    "source-layer": "boundaries",
                    filter: ["<=", "kind_detail", 2],
                    paint: {
                      "line-color": countryBorderColor,
                      "line-width": countryBorderWidth,
                    },
                  } satisfies maplibregl.LayerSpecification,
                ]
              : []),
            ...(customizeRegionBorders
              ? [
                  {
                    id: "places_region",
                    type: "line",
                    source: SOURCE,
                    "source-layer": "boundaries",
                    filter: ["==", "kind", "region"],
                    paint: {
                      "line-color": regionBorderColor,
                      "line-width": regionBorderWidth,
                      ...(regionDashline && { "line-dasharray": [2, 3] }),
                    },
                  } satisfies maplibregl.LayerSpecification,
                ]
              : []),
          ],
        }}
        initialViewState={{
          longitude: 2.213749,
          latitude: 46.227638,
          zoom: 5,
        }}
        mapLib={maplibregl}
      >
        <DeckGLOverlay
          layers={deckLayers}
          getTooltip={({ object }) =>
            object && `Commune: ${object.properties.commune_code_insee}`
          }
        />
      </ReactMapGl>
      {hoveredElement && communeData.length > 0 && (
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            width: "100%",
            height: "200px",
            zIndex: 10,
            background: "rgba(255, 255, 255, 0.8)",
            backdropFilter: "blur(5px)", // Flou pour un effet plus clean
            padding: "10px",
            boxShadow: "0 -2px 10px rgba(0, 0, 0, 0.2)",
          }}
        >
          <h3
            style={{
              textAlign: "center",
              fontSize: "16px",
              marginBottom: "5px",
            }}
          >
            Évolution des prélèvements - Commune : {selectedCommune}
          </h3>
          <ResponsiveContainer width="100%" height="90%">
            <BarChart data={communeData}>
              <XAxis dataKey="year" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="value" fill="#67a353" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* TODO: remove this once the design decision is made */}
      <Leva oneLineLabels />
    </>
  );
}

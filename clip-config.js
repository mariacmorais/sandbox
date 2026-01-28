window.ANNOTATION_CLIPS = [
  // Clip 02 - Mean Parkland: 1 / Mean Nassar: 1 //
  {
    id: "clip_02",
    label: "Clip 1",
    src: "https://raw.githubusercontent.com/mariacmorais/safety-corridor-annotation/main/clip_02.mp4",
    poster: "",
  },
  // Clip 05 - Mean Parkland: 2.1 / Mean Nassar: 1.3//
  {
    id: "clip_05",
    label: "Clip 2",
    src: "https://raw.githubusercontent.com/mariacmorais/safety-corridor-annotation/main/clip_05.mp4",
    poster: "",
  },
  // Clip 17 - Mean Parkland: 3.6 / Mean Nassar: 3 //
  {
    id: "clip_17",
    label: "Clip 3",
    src: "https://raw.githubusercontent.com/mariacmorais/safety-corridor-annotation/main/clip_17.mp4",
    poster: "",
  },
  // Clip 12 - Mean Parkland: 1.4 / Mean Nassar: 1.4 //
  {
    id: "clip_12",
    label: "Clip 4",
    src: "https://raw.githubusercontent.com/mariacmorais/safety-corridor-annotation/main/clip_12.mp4",
    poster: "",
  },
  // Clip 03 - Mean Parkland: 1.3 / Mean Nassar: 1.3 //
  {
    id: "clip_03",
    label: "Clip 5",
    src: "https://raw.githubusercontent.com/mariacmorais/safety-corridor-annotation/main/clip_03.mp4",
    poster: "",
  },
  // Clip 14 - Mean Parkland: 2.8 / Mean Nassar: 2.2 //
  {
    id: "clip_14",
    label: "Clip 6",
    src: "https://raw.githubusercontent.com/mariacmorais/safety-corridor-annotation/main/clip_14.mp4",
    poster: "",
  },
  // Clip 01 - Mean Parkland: 1.2 / Mean Nassar: 1.2 //
  {
    id: "clip_01",
    label: "Clip 7",
    src: "https://raw.githubusercontent.com/mariacmorais/safety-corridor-annotation/main/clip_01.mp4",
    poster: "",
  },
  // Clip 20 - Mean Parkland: 2.8 / Mean Nassar: 2.4 //
  {
    id: "clip_20",
    label: "Clip 8",
    src: "https://raw.githubusercontent.com/mariacmorais/safety-corridor-annotation/main/clip_20.mp4",
    poster: "",
  },
  // Clip 09 - Mean Parkland: 2 / Mean Nassar: 1.5 //
  {
    id: "clip_09",
    label: "Clip 9",
    src: "https://raw.githubusercontent.com/mariacmorais/safety-corridor-annotation/main/clip_09.mp4",
    poster: "",
  },
  // Clip 08 - Mean Parkland: 1.5 / Mean Nassar: 1.1 //
  {
    id: "clip_08",
    label: "Clip 10",
    src: "https://raw.githubusercontent.com/mariacmorais/safety-corridor-annotation/main/clip_08.mp4",
    poster: "",
  },
  // Clip 18 - Mean Parkland: 3.6 / Mean Nassar: 3.4  //
  {
    id: "clip_18",
    label: "Clip 11",
    src: "https://raw.githubusercontent.com/mariacmorais/safety-corridor-annotation/main/clip_18.mp4",
    poster: "",
  },
  // Clip 11 - Mean Parkland: 2.3 / Mean Nassar: 1.6 //
  {
    id: "clip_11",
    label: "Clip 12",
    src: "https://raw.githubusercontent.com/mariacmorais/safety-corridor-annotation/main/clip_11_v2.mov",
    poster: "",
  },
  // Clip 06 - Mean Parkland: 1.6 / Mean Nassar: 1.3  //
  {
    id: "clip_06",
    label: "Clip 13",
    src: "https://raw.githubusercontent.com/mariacmorais/safety-corridor-annotation/main/clip_06.mp4",
    poster: "",
  },
  // Clip 16 - Mean Parkland: 2.6 / Mean Nassar: 2.6  //
  {
    id: "clip_16",
    label: "Clip 14",
    src: "https://raw.githubusercontent.com/mariacmorais/safety-corridor-annotation/main/clip_16.mp4",
    poster: "",
  },
  // Clip 10 - Mean Parkland: 2 / Mean Nassar: 1.1 //
  {
    id: "clip_10",
    label: "Clip 15",
    src: "https://raw.githubusercontent.com/mariacmorais/safety-corridor-annotation/main/clip_10.mp4",
    poster: "",
  },
  // Clip 04 - Mean Parkland: 2.8 / Mean Nassar: 2.1 //
  {
    id: "clip_04",
    label: "Clip 16",
    src: "https://raw.githubusercontent.com/mariacmorais/safety-corridor-annotation/main/clip_04.mp4",
    poster: "",
  },
  // Clip 13 - Mean Parkland: 2.2 / Mean Nassar: 1.6 //
  {
    id: "clip_13",
    label: "Clip 17",
    src: "https://raw.githubusercontent.com/mariacmorais/safety-corridor-annotation/main/clip_13.mp4",
    poster: "",
  },
  // Clip 07 - Mean Parkland: 2.1 / Mean Nassar: 1.5 //
  {
    id: "clip_07",
    label: "Clip 18",
    src: "https://raw.githubusercontent.com/mariacmorais/safety-corridor-annotation/main/clip_07.mp4",
    poster: "",
  },
  // Clip 15 - Mean Parkland: 2.2 / Mean Nassar: 2 //
  {
    id: "clip_15",
    label: "Clip 19",
    src: "https://raw.githubusercontent.com/mariacmorais/safety-corridor-annotation/main/clip_15.mp4",
    poster: "",
  },
  // Clip 19 - Mean Parkland: 2.8 / Mean Nassar: 2.2 //
  {
    id: "clip_19",
    label: "Clip 20",
    src: "https://raw.githubusercontent.com/mariacmorais/safety-corridor-annotation/main/clip_19.mp4",
    poster: "",
  },
];


// Configure where annotations are sent after participants submit.
// Replace `endpoint` with your secure collection URL.
window.ANNOTATION_SUBMISSION = {
  endpoint: "https://formspree.io/f/mblqdnrw", // ← your actual Formspree endpoint
  method: "POST",
  headers: {
    "Content-Type": "application/json"
  },
  additionalFields: {},
  bodyWrapper: "annotation"
};

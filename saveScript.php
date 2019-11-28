<?php
header("content-type: text/plain");

$dataSource = $_POST;

if (isset($dataSource["id"]) && isset($dataSource["line"])) {
  # Sanitize parameters
  $cleanId = preg_replace("/[^a-zA-Z0-9]/", "", $dataSource["id"]);
  
  if (!ctype_print($dataSource["line"])) {
    die("Line may only contain plain text");
  }
  $cleanLine = $dataSource["line"];
  
  if (isset($dataSource["random"])) {
    $fileSuffix = "-" . preg_replace("/[^a-zA-Z0-9]/", "", $dataSource["random"]);
  } else {
    $fileSuffix = "";
  }

  # ^FS: Original:
  #$filename = "data/" . $cleanId . $fileSuffix . ".txt";

  # HvR: added timestamp
  $filename = "data/" . $cleanId . date("-y.m.d-H.i") . ".txt";
  $fileHandle = fopen($filename, "a");
  fwrite($fileHandle, $cleanLine . "\n");
  fclose($fileHandle);
  
  die("OK");
} else {
  die("Required data not set");
}
?>

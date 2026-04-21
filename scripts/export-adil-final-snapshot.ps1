param(
  [string]$WorkbookPath = ".\\Master Endline Sheet .xlsx",
  [string]$OutputPath = ".\\data\\adil-final.csv"
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.IO.Compression.FileSystem

function Get-ZipText {
  param(
    [Parameter(Mandatory = $true)]
    [System.IO.Compression.ZipArchive]$Zip,

    [Parameter(Mandatory = $true)]
    [string]$Name
  )

  $entry = $Zip.Entries | Where-Object { $_.FullName -eq $Name }
  if (-not $entry) {
    throw "Missing workbook entry: $Name"
  }

  $reader = New-Object System.IO.StreamReader($entry.Open())
  try {
    return $reader.ReadToEnd()
  } finally {
    $reader.Close()
  }
}

function Convert-ColumnRefToIndex {
  param(
    [Parameter(Mandatory = $true)]
    [string]$CellRef
  )

  $letters = $CellRef -replace "\d", ""
  $sum = 0
  foreach ($character in $letters.ToCharArray()) {
    $sum = ($sum * 26) + ([int][char]::ToUpper($character) - [int][char]'A' + 1)
  }

  return $sum
}

$resolvedWorkbookPath = (Resolve-Path -LiteralPath $WorkbookPath).Path
$outputDirectory = Split-Path -Parent $OutputPath
if ($outputDirectory) {
  New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
}

$womensPrayerHeader = "Women$([char]0x2019)s prayer section"

$zip = [System.IO.Compression.ZipFile]::OpenRead($resolvedWorkbookPath)

try {
  $sheetNamespace = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
  $relationshipNamespace = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"

  [xml]$workbookXml = Get-ZipText -Zip $zip -Name "xl/workbook.xml"
  [xml]$workbookRelsXml = Get-ZipText -Zip $zip -Name "xl/_rels/workbook.xml.rels"
  [xml]$sharedStringsXml = Get-ZipText -Zip $zip -Name "xl/sharedStrings.xml"

  $workbookNs = New-Object System.Xml.XmlNamespaceManager($workbookXml.NameTable)
  $workbookNs.AddNamespace("d", $sheetNamespace)
  $workbookNs.AddNamespace("r", $relationshipNamespace)

  $sheetNode = $workbookXml.SelectSingleNode("//d:sheet[@name='Adil Final']", $workbookNs)
  if (-not $sheetNode) {
    throw "Could not find a sheet named 'Adil Final'."
  }

  $relationshipId = $sheetNode.GetAttribute("id", $relationshipNamespace)

  $relsNs = New-Object System.Xml.XmlNamespaceManager($workbookRelsXml.NameTable)
  $relsNs.AddNamespace("d", "http://schemas.openxmlformats.org/package/2006/relationships")

  $sheetTarget = ($workbookRelsXml.SelectSingleNode("//d:Relationship[@Id='$relationshipId']", $relsNs)).Target
  [xml]$sheetXml = Get-ZipText -Zip $zip -Name ("xl/" + $sheetTarget)

  $sharedStringsNs = New-Object System.Xml.XmlNamespaceManager($sharedStringsXml.NameTable)
  $sharedStringsNs.AddNamespace("d", $sheetNamespace)

  $sharedStrings = New-Object System.Collections.Generic.List[string]
  foreach ($stringItem in $sharedStringsXml.SelectNodes("//d:si", $sharedStringsNs)) {
    $parts = New-Object System.Collections.Generic.List[string]
    foreach ($textNode in $stringItem.SelectNodes(".//d:t", $sharedStringsNs)) {
      $parts.Add($textNode.InnerText) | Out-Null
    }
    $sharedStrings.Add(($parts -join "")) | Out-Null
  }

  $sheetNs = New-Object System.Xml.XmlNamespaceManager($sheetXml.NameTable)
  $sheetNs.AddNamespace("d", $sheetNamespace)

  $rows = New-Object System.Collections.Generic.List[object]
  foreach ($rowNode in $sheetXml.SelectNodes("//d:sheetData/d:row", $sheetNs)) {
    $cellMap = @{}

    foreach ($cellNode in $rowNode.SelectNodes("./d:c", $sheetNs)) {
      $index = Convert-ColumnRefToIndex -CellRef $cellNode.r
      $valueNode = $cellNode.SelectSingleNode("./d:v", $sheetNs)
      $value = ""

      if ($valueNode) {
        if ($cellNode.t -eq "s") {
          $value = $sharedStrings[[int]$valueNode.InnerText]
        } else {
          $value = $valueNode.InnerText
        }
      }

      $cellMap[$index] = $value
    }

    $maxIndex = if ($cellMap.Keys.Count) {
      ($cellMap.Keys | Measure-Object -Maximum).Maximum
    } else {
      0
    }

    $rowValues = for ($i = 1; $i -le $maxIndex; $i++) {
      if ($cellMap.ContainsKey($i)) {
        $cellMap[$i]
      } else {
        ""
      }
    }

    $rows.Add(@($rowValues)) | Out-Null
  }

  $headers = @($rows[0] | ForEach-Object { [string]$_ })
  $headerIndex = @{}
  for ($i = 0; $i -lt $headers.Count; $i++) {
    $trimmedHeader = ([string]$headers[$i]).Trim()
    if ($trimmedHeader) {
      $headerIndex[$trimmedHeader] = $i
    }
  }

  $wantedHeaders = @(
    "Zone",
    "Mosque ID",
    "Mosque Name",
    "Treatment Name",
    "Mosque Name on Ground",
    "Imam Name",
    "Mosque Built Date",
    "Shrine Name",
    $womensPrayerHeader,
    "Rural = 1 / Urban = 2",
    "WhatsApp Location",
    "Latitude",
    "Longitude",
    "Closest Mosque (WhatsApp Location)",
    "Closest Mosque (Latitude)",
    "Closest Mosque (Longitude)",
    "Photo (Inside)",
    "Photo (Outside)",
    "Comments"
  )

  $exportRows = foreach ($row in ($rows | Select-Object -Skip 1)) {
    $record = [ordered]@{}
    foreach ($header in $wantedHeaders) {
      $index = $headerIndex[$header]
      $value = if ($null -ne $index -and $index -lt $row.Count) {
        [string]$row[$index]
      } else {
        ""
      }

      $record[$header] = $value.Trim()
    }

    [pscustomobject]$record
  }

  $resolvedOutputPath = if ([System.IO.Path]::IsPathRooted($OutputPath)) {
    $OutputPath
  } else {
    Join-Path (Get-Location) $OutputPath
  }

  $exportRows | Export-Csv -Path $resolvedOutputPath -NoTypeInformation -Encoding UTF8
  Write-Host "Exported Adil Final snapshot to $resolvedOutputPath"
} finally {
  $zip.Dispose()
}

# A site-builder for registry.siros.org

## TL;DR

This is the site builder for registry.siros.org: A collection of static assets and github actions that builds registry.siros.org from a list of repositories that run the mtcvctm action. 

## Specification

The site builder is designed to publish a site on github pages. The site is configured using a text-file that contains a list (one per row) of repositories (future versions will support non-github repositories) that is expected to fulfill the following requirements:

1. The repo has a branch "vctm" 
2. The repo has a file .well-known/vctm-registry.json in the "vctm" branch
3. The repo has a set of vctm files in the "vctm" branch

The site builder runs a github action on push and when triggered from the mktcvctm github action.

The generated site should be branded to the siros brand and should organize VCTMs by organization and should provide static and consistent URLs that allow direct download and reference of VCTMs from external consumers as https://registry.siros.org/<org>/<vctm-path>

The html view should be responsive, clean and allow for drilldown into information about the source, owner and history of the published VCTMs


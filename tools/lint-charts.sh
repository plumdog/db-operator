#!/bin/bash -ex

IMAGE='quay.io/helmpack/chart-testing'

cleanup() {
    # Tidy up any generated sub-charts directories, which will be owned by root because of the docker container
    echo "CLEANING UP"
    docker run --rm -it -v $(pwd):/repo --workdir /repo "$IMAGE" sh -c 'rm -rf charts/**/charts && rm -rf charts/**/tmpcharts'
}

main() {
    trap cleanup EXIT
    cleanup
    docker run --rm -it -v $(pwd):/repo --workdir /repo "$IMAGE" ct lint --config ct.yaml "$@"
}

main "$@"

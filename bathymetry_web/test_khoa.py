import io
import json
import unittest
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit
from khoa import DepthError, coordinates, extract, query_bounds


def response(items, total=None, page_size=300, code='00'):
    return io.BytesIO(json.dumps(dict(header=dict(resultCode=code),
        body=dict(totalCount=len(items) if total is None else total, numOfRows=page_size,
                  items=dict(item=items)))).encode())


class ExtractionTests(unittest.TestCase):
    @patch('khoa.credential', return_value='fake')
    @patch('khoa.urlopen')
    def test_six_decimal_input_preserved_but_api_bounds_use_four(self, opened, _):
        opened.return_value = response([dict(lat=37.8123, lot=128.9876, dpwt=111.74)])
        result = extract(37.812345, 128.987654)
        self.assertEqual(result['input'], dict(latitude=37.812345, longitude=128.987654))
        query = parse_qs(urlsplit(opened.call_args[0][0].full_url).query)
        self.assertEqual(query['ymin'], ['37.8073'])
        self.assertEqual(query['ymax'], ['37.8174'])
        self.assertEqual(query['xmin'], ['128.9826'])
        self.assertEqual(query['xmax'], ['128.9927'])

    def test_outward_bounds_and_polar_limits(self):
        for lat, lon in [(37.800001,128.980001),(-37.812345,-128.987654),(90,180),(-90,-180)]:
            b = query_bounds(lat,lon)
            self.assertLessEqual(b['ymin'], max(-90,lat-.005)+1e-10)
            self.assertGreaterEqual(b['ymax'], min(90,lat+.005)-1e-10)
            self.assertLessEqual(b['xmin'], max(-180,lon-.005)+1e-10)
            self.assertGreaterEqual(b['xmax'], min(180,lon+.005)-1e-10)

    def test_reject_invalid_coordinates_before_network(self):
        for pair in [(None, 129), (True, 129), ('NaN', 129), (91, 129), (37, 'inf'), ('', 129)]:
            with self.subTest(pair=pair), self.assertRaises(DepthError):
                coordinates(*pair)

    @patch('khoa.credential', return_value='test+/=key')
    @patch('khoa.urlopen')
    def test_nearest_selection_and_key_encoded_once(self, opened, _):
        opened.return_value = response([dict(lat=37.801, lot=128.982, dpwt=30), dict(lat=37.8, lot=128.98, dpwt=20)])
        result = extract(37.8, 128.98)
        self.assertEqual(result['nearest']['depth_m'], 20)
        self.assertEqual(result['nearest']['distance_m'], 0)
        self.assertNotIn('test+/=key', json.dumps(result))
        self.assertEqual(parse_qs(urlsplit(opened.call_args[0][0].full_url).query)['serviceKey'], ['test+/=key'])
        query = parse_qs(urlsplit(opened.call_args[0][0].full_url).query)
        self.assertEqual(query['ymin'], ['37.795'])
        self.assertEqual(query['xmax'], ['128.985'])

    @patch('khoa.credential', return_value='fake')
    @patch('khoa.urlopen')
    def test_pagination_uses_returned_page_size(self, opened, _):
        opened.side_effect = [response([dict(lat=37.8, lot=128.98, dpwt=20)],2,1),
                              response([dict(lat=37.801, lot=128.981, dpwt=30)],2,1)]
        self.assertEqual(extract(37.8,128.98)['count'],2)
        self.assertEqual(opened.call_count,2)

    @patch('khoa.credential', return_value='fake')
    @patch('khoa.urlopen')
    def test_no_data_is_not_zero_depth(self, opened, _):
        opened.return_value=response([],code='03')
        with self.assertRaises(DepthError) as ctx:
            extract(37.8,128.98)
        self.assertEqual(ctx.exception.status,404)

    @patch('khoa.credential', return_value='fake')
    @patch('khoa.urlopen')
    def test_out_of_area_rejected(self, opened, _):
        opened.return_value=response([dict(lat=38,lot=129,dpwt=25)])
        with self.assertRaises(DepthError): extract(37.8,128.98)

    @patch('khoa.credential', return_value='fake')
    @patch('khoa.urlopen')
    def test_partial_data_not_reported_as_complete(self, opened, _):
        opened.return_value=response([dict(lat=37.8,lot=128.98,dpwt=25)],total=2)
        with self.assertRaises(DepthError): extract(37.8,128.98)

    @patch('khoa.credential', return_value='fake')
    @patch('khoa.urlopen')
    def test_upstream_error_text_not_exposed(self, opened, _):
        opened.return_value=io.BytesIO(b'<error>serviceKey=SECRET</error>')
        with self.assertRaises(DepthError) as ctx: extract(37.8,128.98)
        self.assertNotIn('SECRET',str(ctx.exception))


if __name__=='__main__': unittest.main()
